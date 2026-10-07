"""
Pipeline AI Matching mentor-mentee (FR-4.3 → FR-4.6, US-17 PRD-MATCH-1/2):

    1. Hard filter       : profile_db (read-only) cho biết mentor nào thoả MỌI ràng buộc cứng —
                           5 ràng buộc hệ thống (APPROVED, trạng thái hiệu lực ACCEPTING, có lịch rảnh,
                           còn chỗ, cùng lĩnh vực) + bộ lọc người dùng (giá, ngày, buổi, ngôn ngữ,
                           loại phiên, rating, miễn phí — match_filters.py)
    2. Top-K retrieval   : CHỈ trong các mentor đó, lấy K mentor có vector gần mentee nhất
                           (cosine, pgvector <=>) trong matching_db
    3. Re-rank           : điểm cuối = kết hợp similarity + rating + kinh nghiệm
    4. Explain           : sinh lý do đề xuất để kết quả không phải "hộp đen" (NFR-6)

Lọc TRƯỚC khi xếp hạng (US-17): trước đây lấy top-K theo vector rồi mới lọc, nên khi bộ lọc chặt thì
mentor hợp lệ nằm ngoài top-K bị bỏ sót và kết quả bị hụt. Giờ có ≥ limit mentor hợp lệ (đã lập chỉ
mục) thì luôn trả đủ limit kết quả.

Dữ liệu nằm ở hai DB vì mỗi service sở hữu phần việc của mình: dữ kiện hồ sơ ở profile_db (của
profile-service, đọc read-only), vector ở matching_db. Giữa hai DB chỉ truyền danh sách ID — không
vector nào phải truyền qua mạng.

Các hàm thuần (re_rank, explain, match_filters.*) không truy cập DB để test độc lập.
"""
import re

from app.db import get_matching_pool, get_profile_pool
from app.services import index_service
from app.services import match_filters
from app.services.match_filters import MatchFilters

# K mặc định: số mentor hợp lệ gần nhất về vector được đưa vào re-rank (re-rank cộng thêm rating và
# kinh nghiệm nên lấy dư so với limit).
DEFAULT_K = 50

# Trọng số re-rank — lý do lựa chọn được trình bày trong docs/ai-features.md:
# độ tương đồng nội dung là tín hiệu chính (0.7); rating (0.2) và kinh nghiệm
# (0.1) là tín hiệu phụ giúp phân định các mentor có mức tương đồng gần nhau.
WEIGHT_SIMILARITY = 0.7
WEIGHT_RATING = 0.2
WEIGHT_EXPERIENCE = 0.1
MAX_YEARS_EXPERIENCE_NORM = 10  # chuẩn hoá years_experience về [0, 1]
# Mentor mới chưa có đánh giá nhận rating trung tính thay vì 0, tránh bị
# "phạt" oan (bài toán cold-start).
NEUTRAL_RATING = 3.5

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
        SELECT user_id, domain, goal, skills,
               preferred_days, preferred_time_of_day, budget_max_per_hour, languages
        FROM mentee_profiles WHERE user_id = $1::uuid
        """,
        mentee_id,
    )
    return dict(row) if row else None


# Một dòng cho MỖI mentor: `reason` = lý do bị ràng buộc hệ thống loại (NULL = qua), kèm cờ đúng/sai
# cho từng bộ lọc người dùng (bộ lọc không bật => tham số NULL/rỗng => cờ true). Thứ tự CASE là thứ tự
# kiểm tra ràng buộc (docs/ai-features.md §1.5). Giờ lịch rảnh so theo giờ địa phương của mentor.
#   $1 lĩnh vực mentee   $2 maxRate    $3 days int[]   $4/$5 cửa sổ giờ (bắt đầu/kết thúc)
#   $6 ngôn ngữ text[]   $7 sessionType $8 minRating   $9 ID mentor bỏ qua hoàn toàn (similar-mentors)
_CANDIDATES_CTE = """
WITH c AS (
    SELECT m.user_id AS mentor_id, m.display_name, m.domain, m.skills, m.capacity, m.active_mentee_count,
           m.rating, m.rating_count, m.years_experience, m.hourly_rate, m.verification_status,
           CASE
               WHEN m.verification_status <> 'APPROVED' THEN 'notVerified'
               -- US-08: trạng thái hiệu lực — ON_LEAVE đã qua hết on_leave_until tính là ACCEPTING.
               WHEN NOT (m.status = 'ACCEPTING' OR (m.status = 'ON_LEAVE'
                         AND m.on_leave_until < (now() AT TIME ZONE m.timezone)::date)) THEN 'unavailable'
               WHEN NOT EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id) THEN 'noSchedule'
               WHEN m.active_mentee_count >= m.capacity THEN 'fullCapacity'
               WHEN $1::text IS NOT NULL AND lower(trim(m.domain)) <> lower(trim($1::text)) THEN 'domainMismatch'
           END AS reason,
           ($2::numeric IS NULL OR m.hourly_rate <= $2::numeric) AS rate_ok,
           (m.hourly_rate = 0) AS free_ok,
           (cardinality($6::text[]) = 0 OR m.languages && $6::text[]) AS language_ok,
           ($7::text IS NULL OR $7::text = ANY (m.session_types)) AS session_ok,
           ($8::real IS NULL OR m.rating >= $8::real) AS rating_ok,
           EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id
                   AND (cardinality($3::int[]) = 0 OR a.day_of_week = ANY ($3::int[]))) AS days_ok,
           EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id
                   AND ($4::time IS NULL OR (a.start_time < $5::time AND a.end_time > $4::time))) AS time_ok,
           EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id
                   AND (cardinality($3::int[]) = 0 OR a.day_of_week = ANY ($3::int[]))
                   AND ($4::time IS NULL OR (a.start_time < $5::time AND a.end_time > $4::time))) AS days_time_ok
    FROM mentor_profiles m
    WHERE NOT (m.user_id = ANY ($9::uuid[]))
)
"""


def _filter_params(mentee_domain: str | None, filters: MatchFilters, exclude_ids: list[str]) -> list:
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
    ]


async def eligible_candidates(
    mentee_domain: str | None, filters: MatchFilters, exclude_ids: list[str] | None = None
) -> tuple[list[dict], dict[str, int]]:
    """
    Bước 1 — trên profile_db: (mentor đã qua 5 ràng buộc hệ thống, kèm cờ của từng bộ lọc người dùng;
    số mentor bị loại theo từng lý do hệ thống). Bộ lọc người dùng được áp ở match_filters.apply.
    """
    params = _filter_params(mentee_domain, filters, exclude_ids or [])
    pool = await get_profile_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_CANDIDATES_CTE + "SELECT * FROM c WHERE reason IS NULL", *params)
        counts = await conn.fetch(
            _CANDIDATES_CTE + "SELECT reason, count(*) AS n FROM c WHERE reason IS NOT NULL GROUP BY reason",
            *params,
        )
    return [dict(r) for r in rows], {r["reason"]: r["n"] for r in counts}


async def rank_by_similarity(mentee_id: str, mentor_ids: list, k: int) -> list[dict]:
    """
    Bước 2 — trên matching_db: K mentor (chỉ trong mentor_ids) có vector gần mentee nhất theo cosine
    distance (pgvector <=>). Vector của mentee lấy bằng subquery ngay trong DB. Mentor hợp lệ nhưng
    chưa có vector (hồ sơ vừa tạo, chờ IndexSyncJob) thì chưa xếp hạng được.
    """
    if not mentor_ids:
        return []
    pool = await get_matching_pool()
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


def re_rank(candidates: list[dict]) -> list[dict]:
    for c in candidates:
        # Với vector đã chuẩn hoá, cosine distance ∈ [0, 2]; kẹp similarity về [0, 1]
        similarity = max(0.0, min(1.0, 1 - float(c["distance"])))
        rating = float(c["rating"]) if c.get("rating_count", 0) > 0 else NEUTRAL_RATING
        experience_norm = min(max(c.get("years_experience") or 0, 0) / MAX_YEARS_EXPERIENCE_NORM, 1.0)
        c["similarity_score"] = round(similarity, 4)
        c["final_score"] = round(
            WEIGHT_SIMILARITY * similarity
            + WEIGHT_RATING * (rating / 5)
            + WEIGHT_EXPERIENCE * experience_norm,
            4,
        )
    return sorted(candidates, key=lambda x: x["final_score"], reverse=True)


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
    if mentee.get("domain") and (candidate.get("domain") or "").lower() == mentee["domain"].lower():
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
    return reasons, matched_skills


async def match_mentors_for_mentee(
    mentee_id: str,
    limit: int = 10,
    requested: dict | None = None,
    use_profile_defaults: bool = True,
    exclude_ids: list[str] | None = None,
) -> dict | None:
    """
    Chạy toàn bộ pipeline. Trả về None nếu mentee chưa có hồ sơ/embedding.

    requested: bộ lọc từ query (khoá = match_filters.FILTER_NAMES, None = không truyền); bộ lọc thiếu
    lấy từ sở thích hồ sơ khi use_profile_defaults. exclude_ids: mentor không bao giờ được trả về.
    """
    mentee = await get_mentee(mentee_id)
    if mentee is None:
        return None
    if not await index_service.has_embedding(index_service.MENTEE, mentee_id):
        # Hồ sơ có nhưng chưa được lập chỉ mục: thông báo của profile-service là
        # best-effort nên có thể chưa tới. Lập chỉ mục ngay thay vì bắt mentee chờ
        # vòng quét kế tiếp của IndexSyncJob.
        result = await index_service.reindex(mentee_id, role=index_service.MENTEE)
        if result.status == index_service.PENDING:
            return None

    filters = match_filters.resolve(requested or {}, mentee, use_profile_defaults)
    return await _run(mentee, filters, limit, exclude_ids or [])


async def _run(mentee: dict, filters: MatchFilters, limit: int, exclude_ids: list[str]) -> dict:
    base, excluded = await eligible_candidates(mentee["domain"], filters, exclude_ids)
    eligible, excluded_by = match_filters.apply(base, filters)

    k = max(DEFAULT_K, limit * 5)
    by_id = {c["mentor_id"]: c for c in eligible}
    nearest = await rank_by_similarity(str(mentee["user_id"]), list(by_id), k)
    candidates = []
    for r in nearest:
        c = dict(by_id[r["mentor_id"]])
        c["distance"] = r["distance"]
        candidates.append(c)
    ranked = re_rank(candidates)[:limit]
    for c in ranked:
        c["reasons"], c["matched_skills"] = explain(c, mentee)

    return {
        "mentors": ranked,
        "filters": filters,
        "excluded_by": excluded_by,
        "stats": {
            "considered": len(base) + sum(excluded.values()),
            "excluded": excluded,
            "eligible": len(eligible),
            "retrieved": len(candidates),
            "returned": len(ranked),
            "k": k,
        },
    }
