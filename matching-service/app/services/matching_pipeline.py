"""
Pipeline AI Matching mentor-mentee (FR-4.3 → FR-4.6, US-17 PRD-MATCH-1/2):

    1. Top-K retrieval   : trong matching_db, lấy K mentor có vector gần mentee nhất (cosine, pgvector
                           <=>, chỉ mục HNSW). Truy vấn ANN KHÔNG kèm điều kiện lọc nào
    2. Hard filter       : ở tầng ứng dụng — đọc dữ kiện của đúng K mentor đó từ profile_db (read-only)
                           rồi loại ai không thoả MỌI ràng buộc cứng: 5 ràng buộc hệ thống (APPROVED,
                           trạng thái hiệu lực ACCEPTING, có lịch rảnh, còn chỗ, cùng lĩnh vực) + bộ lọc
                           người dùng (giá, ngày, buổi, ngôn ngữ, loại phiên, rating, miễn phí —
                           match_filters.py)
    3. Re-rank           : điểm cuối = kết hợp similarity + rating + kinh nghiệm
    4. Explain           : sinh lý do đề xuất để kết quả không phải "hộp đen" (NFR-6)

Over-fetch chống "đói ứng viên" (candidate starvation): lọc BÊN TRONG truy vấn ANN (WHERE cạnh ORDER BY
<=>) làm HNSW chỉ trả vài chục ứng viên gần nhất rồi mới lọc, nên bộ lọc chặt có thể để lại 0–2 kết quả
dù còn nhiều mentor hợp lệ. Vì vậy ANN lấy dư (K = max(50, 5×limit)) và lọc ở ứng dụng sau đó; nếu sau khi
lọc vẫn chưa đủ `limit` mà chỉ mục còn mentor chưa xét thì nhân đôi K và lặp lại (tối đa MAX_K), nên có
≥ limit mentor hợp lệ (đã lập chỉ mục) thì vẫn trả đủ limit kết quả.

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

# K mặc định: số mentor gần nhất về vector được lấy về TRƯỚC khi lọc (over-fetch: một phần sẽ bị hard
# filter loại, và re-rank cộng thêm rating/kinh nghiệm nên cũng cần lấy dư so với limit).
DEFAULT_K = 50
# Trần khi tự nhân đôi K để bù cho bộ lọc chặt; chạm trần mà chưa đủ limit thì trả những gì đã có.
MAX_K = 2000

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


# Một dòng cho MỖI mentor trong danh sách ID đưa vào ($9): `reason` = lý do bị ràng buộc hệ thống loại (NULL = qua), kèm cờ đúng/sai
# cho từng bộ lọc người dùng (bộ lọc không bật => tham số NULL/rỗng => cờ true). Thứ tự CASE là thứ tự
# kiểm tra ràng buộc (docs/ai-features.md §1.5). Giờ lịch rảnh so theo giờ địa phương của mentor.
#   $1 lĩnh vực mentee   $2 maxRate    $3 days int[]   $4/$5 cửa sổ giờ (bắt đầu/kết thúc)
#   $6 ngôn ngữ text[]   $7 sessionType $8 minRating   $9 ID mentor cần đọc dữ kiện (K ứng viên từ ANN)
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
    WHERE m.user_id = ANY ($9::uuid[])
)
"""


def _filter_params(mentee_domain: str | None, filters: MatchFilters, mentor_ids: list) -> list:
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
        mentor_ids,
    ]


async def nearest_mentors(mentee_id: str, k: int) -> list[dict]:
    """
    Bước 1 — trên matching_db: K mentor có vector gần mentee nhất theo cosine distance (pgvector <=>,
    chỉ mục HNSW). KHÔNG có điều kiện lọc: lọc nằm ở tầng ứng dụng (xem docstring module). Vector của
    mentee lấy bằng subquery ngay trong DB. Mentee chưa có vector => rỗng.
    """
    pool = await get_matching_pool()
    rows = await pool.fetch(
        """
        WITH q AS (SELECT embedding FROM mentee_embeddings WHERE user_id = $1::uuid AND embedding IS NOT NULL)
        SELECT e.user_id AS mentor_id, e.embedding <=> q.embedding AS distance
        FROM mentor_embeddings e, q
        WHERE e.embedding IS NOT NULL
        ORDER BY e.embedding <=> q.embedding ASC
        LIMIT $2
        """,
        mentee_id,
        k,
    )
    return [dict(r) for r in rows]


async def mentor_facts(mentor_ids: list, mentee_domain: str | None, filters: MatchFilters) -> list[dict]:
    """
    Bước 2a — trên profile_db: dữ kiện của đúng các mentor đã lấy từ ANN, kèm `reason` (lý do bị ràng
    buộc hệ thống loại, NULL = qua) và cờ đúng/sai cho từng bộ lọc người dùng. SQL chỉ TÍNH cờ; việc
    quyết định ai bị loại do `split_by_system_constraints` và `match_filters.apply` làm ở tầng ứng dụng.
    """
    if not mentor_ids:
        return []
    pool = await get_profile_pool()
    rows = await pool.fetch(_CANDIDATES_CTE + "SELECT * FROM c", *_filter_params(mentee_domain, filters, mentor_ids))
    return [dict(r) for r in rows]


def split_by_system_constraints(rows: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """Bước 2b — (mentor qua cả 5 ràng buộc hệ thống, số mentor bị loại theo từng lý do)."""
    passed = [r for r in rows if r["reason"] is None]
    excluded: dict[str, int] = {}
    for r in rows:
        if r["reason"] is not None:
            excluded[r["reason"]] = excluded.get(r["reason"], 0) + 1
    return passed, excluded


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
    skip = {str(i) for i in exclude_ids}
    k = max(DEFAULT_K, limit * 5)
    while True:
        raw = await nearest_mentors(str(mentee["user_id"]), k)
        exhausted = len(raw) < k  # ANN trả ít hơn K => đã xét hết chỉ mục, tăng K cũng vô ích
        nearest = [r for r in raw if str(r["mentor_id"]) not in skip]
        facts = await mentor_facts([r["mentor_id"] for r in nearest], mentee["domain"], filters)
        base, excluded = split_by_system_constraints(facts)
        eligible, excluded_by = match_filters.apply(base, filters)
        if len(eligible) >= limit or exhausted or k >= MAX_K:
            break
        k = min(k * 2, MAX_K)

    by_id = {c["mentor_id"]: c for c in eligible}
    candidates = []
    for r in nearest:
        if r["mentor_id"] in by_id:
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
            "considered": len(facts),
            "excluded": excluded,
            "eligible": len(eligible),
            "retrieved": len(candidates),
            "returned": len(ranked),
            "k": k,
        },
    }


async def similar_mentors(mentee_id: str, exclude_mentor_id: str, limit: int = 3) -> list[dict]:
    """
    Interface cho mentoring-service (US-15): mentor phù hợp nhất với mentee, trừ exclude_mentor_id.
    Áp sở thích hồ sơ làm bộ lọc; nếu chưa đủ `limit` thì nới hết bộ lọc người dùng (vẫn giữ 5 ràng
    buộc hệ thống) để bổ sung, kết quả vòng đầu đứng trước. Mentee chưa có hồ sơ/chỉ mục => rỗng.
    """
    first = await match_mentors_for_mentee(mentee_id, limit=limit, exclude_ids=[exclude_mentor_id])
    if first is None:
        return []
    mentors = list(first["mentors"])
    if len(mentors) < limit and first["filters"].active():
        taken = [exclude_mentor_id] + [str(m["mentor_id"]) for m in mentors]
        mentee = await get_mentee(mentee_id)
        if mentee is not None:
            relaxed = await _run(mentee, MatchFilters(), limit - len(mentors), taken)
            mentors += relaxed["mentors"]
    return mentors[:limit]
