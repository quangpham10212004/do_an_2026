"""
Pipeline AI Matching mentor-mentee (FR-4.3 → FR-4.6, US-17 PRD-MATCH-1/2):

    1. Hard filter       : profile_db (read-only) cho biết mentor nào thoả MỌI ràng buộc cứng —
                           5 ràng buộc hệ thống (APPROVED, trạng thái hiệu lực ACCEPTING, có lịch rảnh,
                           còn chỗ, cùng lĩnh vực) + bộ lọc người dùng (giá, ngày, buổi, ngôn ngữ,
                           loại phiên, rating — match_filters.py)
    2. Top-K retrieval   : CHỈ trong các mentor đó, lấy K mentor có vector gần mentee nhất
                           (cosine, pgvector <=>) trong matching_db
    3. Re-rank           : điểm cuối = 0.6·similarity + 0.15·rating/5 + 0.1·kinh nghiệm + 0.1·scheduleFit
                           + 0.05·responsiveness (US-35, PRD-MATCH-3; trọng số cấu hình được — config.py).
                           Mentor < 3 đánh giá dùng trung vị rating nền tảng (PRD-MATCH-4, ranking_signals.py)
    4. Explain           : sinh lý do đề xuất để kết quả không phải "hộp đen" (NFR-6)

Lọc TRƯỚC khi xếp hạng (US-17): trước đây lấy top-K theo vector rồi mới lọc, nên khi bộ lọc chặt thì
mentor hợp lệ nằm ngoài top-K bị bỏ sót và kết quả bị hụt. Giờ có ≥ limit mentor hợp lệ (đã lập chỉ
mục) thì luôn trả đủ limit kết quả.

Dữ liệu nằm ở hai DB vì mỗi service sở hữu phần việc của mình: dữ kiện hồ sơ ở profile_db (của
profile-service, đọc read-only), vector ở matching_db. Giữa hai DB chỉ truyền danh sách ID — không
vector nào phải truyền qua mạng.

Các hàm thuần (re_rank, explain, match_filters.*) không truy cập DB để test độc lập.
"""
import asyncio
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import asyncpg

from app import config
from app.db import get_matching_pool, get_profile_pool
from app.services.embedding_service import EMBEDDING_DIM
from app.services import profile_text
from app.services import feedback_service
from app.services import index_service
from app.services import match_filters
from app.services import ranking_signals as signals
from app.services.match_filters import MatchFilters

# K mặc định: số mentor hợp lệ gần nhất về vector được đưa vào re-rank (re-rank cộng thêm rating và
# kinh nghiệm nên lấy dư so với limit).
DEFAULT_K = 50

# Trọng số re-rank (US-35, PRD-MATCH-3) — lý do lựa chọn ở docs/ai-features.md: độ tương đồng nội dung vẫn là
# tín hiệu chính; rating, kinh nghiệm, độ khớp lịch rảnh và tốc độ phản hồi phân định các mentor tương đồng gần nhau.
WEIGHT_SIMILARITY = config.MATCH_WEIGHT_SIMILARITY
WEIGHT_RATING = config.MATCH_WEIGHT_RATING
WEIGHT_EXPERIENCE = config.MATCH_WEIGHT_EXPERIENCE
WEIGHT_SCHEDULE = config.MATCH_WEIGHT_SCHEDULE
WEIGHT_RESPONSIVENESS = config.MATCH_WEIGHT_RESPONSIVENESS
WEIGHTS = {
    "similarity": WEIGHT_SIMILARITY,
    "rating": WEIGHT_RATING,
    "experience": WEIGHT_EXPERIENCE,
    "scheduleFit": WEIGHT_SCHEDULE,
    "responsiveness": WEIGHT_RESPONSIVENESS,
}
INTENT_CURRENT = "CURRENT"
INTENT_SWITCH = "SWITCH"


@dataclass(frozen=True)
class MatchIntent:
    """
    Mục đích lượt tìm. CURRENT = phát triển trong lĩnh vực hồ sơ (hành vi cũ). SWITCH = học thứ mới / chuyển ngách:
    lĩnh vực mentor là target_domain (không còn là lĩnh vực hiện tại của mentee), vector truy vấn dựng từ mục tiêu mới +
    kỹ năng nền hiện có, và mentor từng làm đúng lĩnh vực hiện tại của mentee được cộng điểm "transition".
    """
    mode: str = INTENT_CURRENT
    target_domain: str | None = None
    goal_text: str | None = None
    # Kỹ năng riêng của lĩnh vực được chọn (lĩnh vực phụ trong hồ sơ); rỗng = dùng kỹ năng hồ sơ chính.
    skills: tuple[str, ...] = ()

    @property
    def is_switch(self) -> bool:
        return self.mode == INTENT_SWITCH and bool(self.target_domain)


def switch_weights() -> dict:
    """Trọng số chế độ chuyển ngách: tách TRANSITION khỏi similarity để tổng vẫn bằng 1,00."""
    t = config.MATCH_WEIGHT_TRANSITION
    return {**WEIGHTS, "similarity": WEIGHTS["similarity"] - t, "transition": t}


def query_text(mentee: dict, intent: MatchIntent) -> str:
    """Văn bản đưa vào embedding làm truy vấn: mục tiêu mới + kỹ năng nền, cùng cấu trúc với hồ sơ mentee."""
    return profile_text.normalize_mentee({
        "domain": intent.target_domain,
        "skills": list(intent.skills) or mentee.get("skills"),
        "current_level": mentee.get("current_level"),
        "goal": intent.goal_text or mentee.get("goal"),
    })


MAX_YEARS_EXPERIENCE_NORM = 10  # chuẩn hoá years_experience về [0, 1]
# Rating dùng khi chưa tính được trung vị nền tảng (chưa mentor nào có ≥ 3 đánh giá) — cold-start.
NEUTRAL_RATING = signals.FALLBACK_MEDIAN_RATING

# Mã lý do loại bỏ của ràng buộc hệ thống — trả về trong pipeline.excluded (thứ tự = thứ tự kiểm tra).
REASON_NOT_VERIFIED = "notVerified"
REASON_UNAVAILABLE = "unavailable"
REASON_NO_SCHEDULE = "noSchedule"
REASON_FULL_CAPACITY = "fullCapacity"
REASON_DOMAIN_MISMATCH = "domainMismatch"


async def get_mentee(mentee_id: str) -> dict | None:
    """Dữ kiện hồ sơ mentee (profile_db, read-only) — hard filter, explain và bộ lọc mặc định (US-16)."""
    pool = await get_profile_pool()
    row = await pool.fetchrow(
        """
        SELECT user_id, domain, goal, skills, current_level,
               preferred_days, preferred_time_of_day, budget_max_per_hour, languages, timezone
        FROM mentee_profiles WHERE user_id = $1::uuid
        """,
        mentee_id,
    )
    if row is None:
        return None
    mentee = dict(row)
    mentee["extra_domains"] = await _extra_domains(pool, mentee_id)
    return mentee


async def _extra_domains(pool, mentee_id: str) -> list[dict]:
    """Lĩnh vực phụ của mentee (mỗi lĩnh vực có kỹ năng + mục tiêu riêng). Bảng chưa có (profile-service chưa migrate) = rỗng."""
    try:
        rows = await pool.fetch(
            "SELECT domain, skills, goal FROM mentee_domains WHERE mentee_id = $1::uuid ORDER BY added_at", mentee_id)
    except asyncpg.UndefinedTableError:
        return []
    return [dict(r) for r in rows]


class DomainNotInProfileError(Exception):
    """Lĩnh vực được chọn không nằm trong hồ sơ mentee (không phải lĩnh vực chính cũng không phải lĩnh vực phụ)."""

    def __init__(self, domain: str, available: list[str]):
        super().__init__(domain)
        self.domain = domain
        self.available = available


def resolve_intent(mentee: dict, domain: str | None, intent: MatchIntent | None = None) -> MatchIntent:
    """
    Đổi lĩnh vực mentee chọn để tìm thành mục đích lượt tìm. Chỉ được chọn lĩnh vực trong hồ sơ (chính hoặc phụ):
    lĩnh vực chính = CURRENT (vector mentee đã lập chỉ mục); lĩnh vực phụ = vector truy vấn dựng từ kỹ năng + mục tiêu
    RIÊNG của lĩnh vực đó, kèm tín hiệu transition (mentor từng làm đúng lĩnh vực chính). `domain` rỗng = lĩnh vực chính,
    trừ khi `intent` (tương thích ngược intent=SWITCH&targetDomain) đã chỉ định lĩnh vực đích.
    """
    wanted = (domain or (intent.target_domain if intent is not None and intent.is_switch else None) or "").strip().lower()
    primary = (mentee.get("domain") or "").strip().lower()
    if not wanted or wanted == primary:
        return MatchIntent()
    extras = {(e["domain"] or "").lower(): e for e in mentee.get("extra_domains") or []}
    extra = extras.get(wanted)
    if extra is None:
        raise DomainNotInProfileError(wanted, [primary, *extras])
    goal = (intent.goal_text if intent is not None and intent.goal_text else None) or extra.get("goal")
    return MatchIntent(mode=INTENT_SWITCH, target_domain=wanted, goal_text=goal, skills=tuple(extra.get("skills") or ()))


# Một dòng cho MỖI mentor: `reason` = lý do bị ràng buộc hệ thống loại (NULL = qua), kèm cờ đúng/sai
# cho từng bộ lọc người dùng (bộ lọc không bật => tham số NULL/rỗng => cờ true). Thứ tự CASE là thứ tự
# kiểm tra ràng buộc (docs/ai-features.md §1.5). Giờ lịch rảnh so theo giờ địa phương của mentor.
#   $1 lĩnh vực mentee   $2 maxRate    $3 days int[]   $4/$5 cửa sổ giờ (bắt đầu/kết thúc)
#   $6 ngôn ngữ text[]   $7 sessionType $8 minRating   $9 ID mentor bỏ qua hoàn toàn (similar-mentors)
#   $10 MIN_REVIEWS (ngưỡng rating thật)   $11 trung vị nền tảng đã có fallback (G1, D9)
_CANDIDATES_CTE = """
WITH c AS (
    SELECT m.user_id AS mentor_id, m.display_name, COALESCE(d.domain, m.domain) AS domain,
           m.skills, m.capacity, m.active_mentee_count,
           m.rating, m.rating_count, m.years_experience, COALESCE(d.hourly_rate, m.hourly_rate) AS hourly_rate,
           m.verification_status,
           m.timezone, m.median_response_hours, m.headline, m.previous_domains,
           CASE
               WHEN m.verification_status <> 'APPROVED' THEN 'notVerified'
               -- US-08: trạng thái hiệu lực — ON_LEAVE đã qua hết on_leave_until tính là ACCEPTING.
               WHEN NOT (m.status = 'ACCEPTING' OR (m.status = 'ON_LEAVE'
                         AND m.on_leave_until < (now() AT TIME ZONE m.timezone)::date)) THEN 'unavailable'
               WHEN d.accepting IS FALSE THEN 'unavailable'
               WHEN NOT EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id) THEN 'noSchedule'
               WHEN m.active_mentee_count >= m.capacity THEN 'fullCapacity'
               WHEN $1::text IS NOT NULL AND d.mentor_id IS NULL
                    AND lower(trim(m.domain)) <> lower(trim($1::text)) THEN 'domainMismatch'
           END AS reason,
           ($2::numeric IS NULL OR COALESCE(d.hourly_rate, m.hourly_rate) <= $2::numeric) AS rate_ok,
           (cardinality($6::text[]) = 0 OR m.languages && $6::text[]) AS language_ok,
           ($7::text IS NULL OR $7::text = ANY (m.session_types)) AS session_ok,
           -- G1/D9: minRating so với rating HIỆU LỰC (effective_rating) — cùng khái niệm với tín hiệu
           -- chấm điểm C13, không so với rating thô. Mentor dưới MIN_REVIEWS đánh giá được so bằng
           -- trung vị nền tảng (đã có fallback ở Python), không phải rating thô (thường là 0).
           ($8::real IS NULL OR
            (CASE WHEN m.rating_count >= $10::int THEN m.rating ELSE $11::real END) >= $8::real
           ) AS rating_ok,
           EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id
                   AND (cardinality($3::int[]) = 0 OR a.day_of_week = ANY ($3::int[]))) AS days_ok,
           EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id
                   AND ($4::time IS NULL OR (a.start_time < $5::time AND a.end_time > $4::time))) AS time_ok,
           EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id
                   AND (cardinality($3::int[]) = 0 OR a.day_of_week = ANY ($3::int[]))
                   AND ($4::time IS NULL OR (a.start_time < $5::time AND a.end_time > $4::time))) AS days_time_ok
    FROM mentor_profiles m
    LEFT JOIN mentor_domains d ON d.mentor_id = m.user_id AND d.verified_at IS NOT NULL
          AND d.domain = COALESCE(lower(trim($1::text)), lower(trim(m.domain)))
    WHERE NOT (m.user_id = ANY ($9::uuid[]))
)
"""


def _filter_params(
    mentee_domain: str | None, filters: MatchFilters, exclude_ids: list[str], effective_median: float,
) -> list:
    window_start, window_end = filters.time_window()
    return [
        mentee_domain,
        filters.max_rate,
        list(filters.days),
        window_start,
        window_end,
        list(filters.language),
        filters.session_type,
        filters.min_rating,
        exclude_ids,
        signals.MIN_REVIEWS,
        effective_median,
    ]


async def eligible_candidates(
    mentee_domain: str | None, filters: MatchFilters, exclude_ids: list[str] | None = None,
    platform_median: float | None = None,
) -> tuple[list[dict], dict[str, int]]:
    """
    Bước 1 — trên profile_db: (mentor đã qua 5 ràng buộc hệ thống, kèm cờ của từng bộ lọc người dùng;
    số mentor bị loại theo từng lý do hệ thống). Bộ lọc người dùng được áp ở match_filters.apply.

    platform_median: trung vị rating nền tảng (None khi chưa đủ dữ liệu) — dùng để tính rating_ok
    (G1/D9) giống đúng effective_rating ở bước chấm điểm, có fallback FALLBACK_MEDIAN_RATING khi None.
    """
    effective_median = platform_median if platform_median is not None else signals.FALLBACK_MEDIAN_RATING
    params = _filter_params(mentee_domain, filters, exclude_ids or [], effective_median)
    pool = await get_profile_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_CANDIDATES_CTE + "SELECT * FROM c WHERE reason IS NULL", *params)
        counts = await conn.fetch(
            _CANDIDATES_CTE + "SELECT reason, count(*) AS n FROM c WHERE reason IS NOT NULL GROUP BY reason",
            *params,
        )
    return [dict(r) for r in rows], {r["reason"]: r["n"] for r in counts}


async def rank_by_similarity(mentee_id: str, mentor_ids: list, k: int, query_vector: list[float] | None = None) -> list[dict]:
    """
    Bước 2 — trên matching_db: K mentor (chỉ trong mentor_ids) có vector gần mentee nhất theo cosine
    distance (pgvector <=>). Mặc định vector của mentee lấy bằng subquery ngay trong DB; chế độ chuyển ngách
    truyền query_vector (embedding của mục tiêu mới). Mentor hợp lệ nhưng chưa có vector (hồ sơ vừa tạo,
    chờ IndexSyncJob) thì chưa xếp hạng được.
    """
    if not mentor_ids:
        return []
    pool = await get_matching_pool()
    if query_vector is not None:
        rows = await pool.fetch(
            """
            WITH q AS (SELECT $1::vector AS embedding)
            SELECT e.user_id AS mentor_id, e.embedding <=> q.embedding AS distance
            FROM mentor_embeddings e, q
            WHERE e.embedding IS NOT NULL AND e.user_id = ANY ($2::uuid[])
            ORDER BY e.embedding <=> q.embedding ASC
            LIMIT $3
            """,
            index_service._to_pgvector(query_vector), mentor_ids, k,
        )
        return [dict(r) for r in rows]
    rows = await pool.fetch(
        """
        WITH q AS (SELECT embedding FROM mentee_embeddings WHERE user_id = $1::uuid AND embedding IS NOT NULL)
        SELECT e.user_id AS mentor_id, e.embedding <=> q.embedding AS distance
        FROM mentor_embeddings e, q
        WHERE e.embedding IS NOT NULL AND e.user_id = ANY ($2::uuid[])
        ORDER BY e.embedding <=> q.embedding ASC
        LIMIT $3
        """,
        mentee_id,
        mentor_ids,
        k,
    )
    return [dict(r) for r in rows]


def re_rank(candidates: list[dict], platform_median: float | None = None, weights: dict | None = None) -> list[dict]:
    """
    Điểm cuối (US-35) = Σ trọng số × tín hiệu ∈ [0, 1]. Ứng viên thiếu schedule_fit (vd. script đánh giá offline)
    tính 0; thiếu median_response_hours tính responsiveness trung tính 0.5. score_parts = phần đóng góp của từng tín
    hiệu (cộng lại = final_score) để giao diện giải thích điểm.
    """
    w = weights or WEIGHTS
    for c in candidates:
        # Với vector đã chuẩn hoá, cosine distance ∈ [0, 2]; kẹp similarity về [0, 1]
        similarity = max(0.0, min(1.0, 1 - float(c["distance"])))
        rating = signals.effective_rating(c.get("rating"), c.get("rating_count", 0), platform_median)
        experience_norm = min(max(c.get("years_experience") or 0, 0) / MAX_YEARS_EXPERIENCE_NORM, 1.0)
        fit = float(c.get("schedule_fit") or 0.0)
        responsive = signals.responsiveness(c.get("median_response_hours"))
        parts = {
            "similarity": w["similarity"] * similarity,
            "rating": w["rating"] * (rating / 5),
            "experience": w["experience"] * experience_norm,
            "scheduleFit": w.get("scheduleFit", 0.0) * fit,
            "responsiveness": w.get("responsiveness", 0.0) * responsive,
        }
        if "transition" in w:
            parts["transition"] = w["transition"] * float(c.get("transition_fit") or 0.0)
        c["similarity_score"] = round(similarity, 4)
        c["rating_used"] = round(rating, 2)
        c["new_mentor"] = signals.is_new_mentor(c.get("rating_count", 0))
        c["schedule_fit"] = round(fit, 4)
        c["responsiveness"] = responsive
        c["score_parts"] = {k: round(v, 4) for k, v in parts.items()}
        c["final_score"] = round(sum(parts.values()), 4)
    return sorted(candidates, key=lambda x: x["final_score"], reverse=True)


async def platform_median_rating() -> float | None:
    """PRD-MATCH-4 — trung vị rating của mentor APPROVED có ≥ 3 đánh giá (None khi chưa có ai)."""
    pool = await get_profile_pool()
    value = await pool.fetchval(
        """
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY rating)
        FROM mentor_profiles WHERE verification_status = 'APPROVED' AND rating_count >= $1
        """,
        signals.MIN_REVIEWS,
    )
    return float(value) if value is not None else None


async def schedule_inputs(mentor_ids: list, now: datetime) -> tuple[dict, dict]:
    """
    Lịch rảnh hằng tuần + ngoại lệ trong 15 ngày tới (đủ phủ 14 ngày ở mọi múi giờ) của các mentor đã truy hồi.
    Trả về ({mentor_id: [(dow, start, end)]}, {mentor_id: [(date, start, end)]}).
    """
    if not mentor_ids:
        return {}, {}
    pool = await get_profile_pool()
    async with pool.acquire() as conn:
        slots = await conn.fetch(
            "SELECT mentor_id, day_of_week, start_time, end_time FROM mentor_availability WHERE mentor_id = ANY ($1::uuid[])",
            mentor_ids,
        )
        exceptions = await conn.fetch(
            """
            SELECT mentor_id, date, start_time, end_time FROM mentor_availability_exceptions
            WHERE mentor_id = ANY ($1::uuid[]) AND date BETWEEN $2::date AND $3::date
            """,
            mentor_ids, (now - timedelta(days=1)).date(), (now + timedelta(days=signals.HORIZON_DAYS + 1)).date(),
        )
    availability: dict = {}
    for r in slots:
        availability.setdefault(r["mentor_id"], []).append((r["day_of_week"], r["start_time"], r["end_time"]))
    blocked: dict = {}
    for r in exceptions:
        blocked.setdefault(r["mentor_id"], []).append((r["date"], r["start_time"], r["end_time"]))
    return availability, blocked


def _contains_term(text: str, term: str) -> bool:
    pattern = r"(?<![\w])" + re.escape(term.lower()) + r"(?![\w])"
    return re.search(pattern, text.lower()) is not None


def explain(candidate: dict, mentee: dict) -> tuple[list[str], list[str]]:
    """FR-4.6 — sinh lý do đề xuất dễ hiểu. Trả về (reasons, matched_skills)."""
    mentor_skills: list[str] = list(candidate.get("skills") or [])
    mentee_skills = {s.lower() for s in (mentee.get("skills") or [])}
    goal = mentee.get("goal") or ""

    matched = [s for s in mentor_skills if s.lower() in mentee_skills]
    goal_hits = [s for s in mentor_skills if s not in matched and goal and _contains_term(goal, s)]
    matched_skills = matched + goal_hits

    reasons: list[str] = []
    if matched:
        reasons.append("Trùng kỹ năng: " + ", ".join(matched[:5]))
    if goal_hits:
        reasons.append("Có chuyên môn phù hợp mục tiêu của bạn: " + ", ".join(goal_hits[:5]))
    if candidate.get("transition_fit"):
        reasons.insert(0, f"Từng chuyển từ {mentee['domain']} sang {candidate['domain']} — đã đi đúng con đường bạn muốn đi")
    elif mentee.get("domain") and (candidate.get("domain") or "").lower() == mentee["domain"].lower():
        reasons.append(f"Cùng lĩnh vực {candidate['domain']}")
    similarity = candidate.get("similarity_score", 0)
    if similarity >= 0.6:
        reasons.append(f"Hồ sơ rất tương đồng về nội dung ({similarity:.0%})")
    elif similarity >= 0.4:
        reasons.append(f"Hồ sơ tương đồng khá về nội dung ({similarity:.0%})")
    if candidate.get("rating_count", 0) > 0 and float(candidate.get("rating", 0)) >= 4.0:
        reasons.append(f"Được đánh giá cao ({float(candidate['rating']):.1f}/5 từ {candidate['rating_count']} lượt)")
    if (candidate.get("years_experience") or 0) >= 5:
        reasons.append(f"{candidate['years_experience']} năm kinh nghiệm")
    fit = candidate.get("schedule_fit")
    if fit is not None and fit >= 0.5:
        reasons.append(f"Lịch rảnh khớp {fit:.0%} khung giờ bạn muốn học trong 2 tuần tới")
    if candidate.get("responsiveness") == 1.0 and candidate.get("median_response_hours") is not None:
        reasons.append("Thường phản hồi yêu cầu trong 24 giờ")
    if candidate.get("new_mentor"):
        reasons.append("Mentor mới — chưa đủ 3 đánh giá, xếp hạng theo mức đánh giá chung của nền tảng")
    return reasons, matched_skills


async def match_mentors_for_mentee(
    mentee_id: str,
    limit: int = 10,
    requested: dict | None = None,
    use_profile_defaults: bool = True,
    exclude_ids: list[str] | None = None,
    include_over_budget: bool = True,
    intent: MatchIntent | None = None,
    domain: str | None = None,
) -> dict | None:
    """
    Chạy toàn bộ pipeline. Trả về None nếu mentee chưa có hồ sơ/embedding.
    domain: lĩnh vực mentee chọn để tìm (phải nằm trong hồ sơ, xem resolve_intent); bỏ trống = lĩnh vực chính.
    Raise DomainNotInProfileError khi lĩnh vực không thuộc hồ sơ.

    requested: bộ lọc từ query (khoá = match_filters.FILTER_NAMES, None = không truyền); bộ lọc thiếu
    lấy từ sở thích hồ sơ khi use_profile_defaults. exclude_ids: mentor không bao giờ được trả về.
    include_over_budget: mentor vượt ngân sách không bị loại mà đứng cuối danh sách (xem _run).
    """
    mentee = await get_mentee(mentee_id)
    if mentee is None:
        return None
    intent = resolve_intent(mentee, domain, intent)
    if not await index_service.has_embedding(index_service.MENTEE, mentee_id):
        # Hồ sơ có nhưng chưa được lập chỉ mục: thông báo của profile-service là
        # best-effort nên có thể chưa tới. Lập chỉ mục ngay thay vì bắt mentee chờ
        # vòng quét kế tiếp của IndexSyncJob.
        result = await index_service.reindex(mentee_id, role=index_service.MENTEE)
        if result.status == index_service.PENDING:
            return None

    filters = match_filters.resolve(requested or {}, mentee, use_profile_defaults)
    # US-36 — mentor mentee đã bấm "Không phù hợp" bị ẩn 30 ngày, loại TRƯỚC khi xếp hạng.
    hidden = await feedback_service.hidden_mentor_ids(mentee_id)
    result = await _run(mentee, filters, limit, list(exclude_ids or []) + hidden, include_over_budget, intent)
    result["stats"]["hidden"] = len(hidden)
    return result


async def _retrieve_and_rank(mentee: dict, pool: list[dict], k: int, platform_median: float | None,
                             timing: dict | None = None, intent: MatchIntent | None = None) -> list[dict]:
    """
    Bước 2 + 3 + 4 cho một nhóm mentor đã qua bộ lọc: top-K theo vector → re-rank → lý do. Chưa cắt theo limit.
    timing: nếu truyền, cộng dồn mili-giây từng bước vào timing["retrieve"/"rerank"/"explain"] và giữ
    vài mentor gần nhất về vector ở timing["nearest"] để giao diện trình bày pipeline.
    """
    t = timing if timing is not None else {}
    by_id = {c["mentor_id"]: c for c in pool}
    t0 = time.perf_counter()
    switch = intent is not None and intent.is_switch
    query_vector = None
    if switch:
        text = query_text(mentee, intent)
        t["query_text"] = text
        query_vector = await asyncio.to_thread(index_service.embed_text, text)
    nearest = await rank_by_similarity(str(mentee["user_id"]), list(by_id), k, query_vector)
    t1 = time.perf_counter()
    now = datetime.now(timezone.utc)
    availability, blocked = await schedule_inputs([r["mentor_id"] for r in nearest], now)
    candidates = []
    for r in nearest:
        c = dict(by_id[r["mentor_id"]])
        c["distance"] = r["distance"]
        # Chuyển ngách: mentor từng làm đúng lĩnh vực hiện tại của mentee đã đi đúng con đường mentee muốn đi.
        c["transition_fit"] = 1.0 if switch and (mentee.get("domain") or "").lower() in [
            d.lower() for d in (c.get("previous_domains") or [])] else 0.0
        c["schedule_fit"] = signals.schedule_fit(now, mentee, c.get("timezone"), availability.get(r["mentor_id"], []),
                                                 blocked.get(r["mentor_id"], []))
        candidates.append(c)
    ranked = re_rank(candidates, platform_median, switch_weights() if switch else None)
    t2 = time.perf_counter()
    reason_count = 0
    for c in ranked:
        c["reasons"], c["matched_skills"] = explain(c, mentee)
        reason_count += len(c["reasons"])
    t3 = time.perf_counter()
    t["retrieve"] = t.get("retrieve", 0.0) + (t1 - t0) * 1000
    t["rerank"] = t.get("rerank", 0.0) + (t2 - t1) * 1000
    t["explain"] = t.get("explain", 0.0) + (t3 - t2) * 1000
    t["reasons"] = t.get("reasons", 0) + reason_count
    t.setdefault("nearest", []).extend(
        {"display_name": c["display_name"], "similarity": max(0.0, min(1.0, 1 - float(c["distance"])))}
        for c in sorted(candidates, key=lambda x: x["distance"])[:3]
    )
    return ranked


async def _run(mentee: dict, filters: MatchFilters, limit: int, exclude_ids: list[str],
               include_over_budget: bool = False, intent: MatchIntent | None = None) -> dict:
    """
    include_over_budget: maxRate trở thành ưu tiên mềm. Mentor vượt ngân sách (nhưng qua mọi bộ lọc khác) không bị loại
    mà được xếp RIÊNG và đặt SAU mọi mentor trong ngân sách, kèm over_budget / over_budget_by. Hai nhóm lấy top-K riêng
    để mentor vượt ngân sách không chiếm chỗ của mentor trong ngân sách. False = lọc cứng như trước (US-17).
    """
    soft = include_over_budget and filters.max_rate is not None
    # G1/D9: trung vị nền tảng tính TRƯỚC để minRating (SQL, rating_ok) và chấm điểm (re_rank, C13)
    # dùng cùng một effective_rating cho mentor mới — không còn hai nguồn sự thật khác nhau.
    timing: dict = {}
    t_filter = time.perf_counter()
    median = await platform_median_rating()
    intent = intent or MatchIntent()
    domain = intent.target_domain if intent.is_switch else mentee["domain"]
    base, excluded = await eligible_candidates(domain, filters, exclude_ids, platform_median=median)
    eligible, excluded_by = match_filters.apply(base, filters, soft_rate=soft)
    filter_ms = (time.perf_counter() - t_filter) * 1000

    k = max(DEFAULT_K, limit * 5)
    in_budget = [c for c in eligible if not match_filters.over_budget(c, filters)]
    over = [c for c in eligible if match_filters.over_budget(c, filters)]

    ranked_in = await _retrieve_and_rank(mentee, in_budget, k, median, timing, intent)
    ranked = ranked_in[:limit]
    retrieved = len(ranked_in)

    shown_over: list[dict] = []
    if over:
        # Đủ chỗ để mentee thấy lựa chọn ngoài ngân sách: tối thiểu OVER_BUDGET_SHOWN, và bù cho đủ `limit`
        # khi mentor trong ngân sách ít.
        slots = max(config.OVER_BUDGET_SHOWN, limit - len(ranked))
        ranked_over = await _retrieve_and_rank(mentee, over, k, median, timing, intent)
        retrieved += len(ranked_over)
        shown_over = ranked_over[:slots]
        for c in shown_over:
            c["over_budget"] = True
            c["over_budget_by"] = round(float(c["hourly_rate"]) - float(filters.max_rate), 2)

    mentors = ranked + shown_over
    return {
        "mentors": mentors,
        "filters": filters,
        "excluded_by": excluded_by,
        "intent": intent,
        "stats": {
            "considered": len(base) + sum(excluded.values()),
            "excluded": excluded,
            "eligible": len(eligible),
            "over_budget": len(over),
            "retrieved": retrieved,
            "returned": len(mentors),
            "k": k,
            "stages": _stages(timing, filter_ms, len(base) + sum(excluded.values()), excluded, len(eligible), k, retrieved,
                              mentors, switch_weights() if intent.is_switch else WEIGHTS),
        },
    }


def _stages(timing: dict, filter_ms: float, considered: int, excluded: dict, eligible: int, k: int,
            retrieved: int, mentors: list[dict], weights: dict) -> dict:
    """Số liệu THẬT của từng bước pipeline (đo trong _run) để giao diện trình bày kỹ thuật AI Matching."""
    nearest = sorted(timing.get("nearest", []), key=lambda n: n["similarity"], reverse=True)[:3]
    return {
        "filter": {"ms": round(filter_ms, 1), "considered": considered, "excluded": excluded, "eligible": eligible},
        "retrieve": {
            "ms": round(timing.get("retrieve", 0.0), 1), "model": config.EMBEDDING_MODEL, "dim": EMBEDDING_DIM,
            "k": k, "retrieved": retrieved, "query_text": timing.get("query_text"),
            "nearest": [{"display_name": n["display_name"], "similarity": round(n["similarity"], 4)} for n in nearest],
        },
        "rerank": {
            "ms": round(timing.get("rerank", 0.0), 1), "weights": weights,
            "top": [{"display_name": m["display_name"], "final_score": m["final_score"], "score_parts": m["score_parts"]}
                    for m in mentors[:3]],
        },
        "explain": {"ms": round(timing.get("explain", 0.0), 1), "reasons": timing.get("reasons", 0)},
    }


async def similar_mentors(mentee_id: str, exclude_mentor_id: str, limit: int = 3) -> list[dict]:
    """
    Interface cho mentoring-service (US-15): mentor phù hợp nhất với mentee, trừ exclude_mentor_id.
    Áp sở thích hồ sơ làm bộ lọc; nếu chưa đủ `limit` thì nới hết bộ lọc người dùng (vẫn giữ 5 ràng
    buộc hệ thống) để bổ sung, kết quả vòng đầu đứng trước. Mentee chưa có hồ sơ/chỉ mục => rỗng.
    """
    # Gợi ý thay thế (mentoring-service) giữ lọc cứng theo ngân sách: không đề xuất mentor mà mentee không trả nổi.
    first = await match_mentors_for_mentee(mentee_id, limit=limit, exclude_ids=[exclude_mentor_id],
                                           include_over_budget=False)
    if first is None:
        return []
    mentors = list(first["mentors"])
    if len(mentors) < limit and first["filters"].active():
        taken = ([exclude_mentor_id] + [str(m["mentor_id"]) for m in mentors]
                 + await feedback_service.hidden_mentor_ids(mentee_id))
        mentee = await get_mentee(mentee_id)
        if mentee is not None:
            relaxed = await _run(mentee, MatchFilters(), limit - len(mentors), taken)
            mentors += relaxed["mentors"]
    return mentors[:limit]
