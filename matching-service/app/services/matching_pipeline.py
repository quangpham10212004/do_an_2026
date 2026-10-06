"""
Pipeline AI Matching mentor-mentee (FR-4.3 → FR-4.6):

    1. Top-K retrieval   : lấy K mentor có vector gần mentee nhất (cosine, pgvector <=>)
    2. Hard filter       : loại mentor không thoả ràng buộc thực tế
    3. Re-rank           : điểm cuối = kết hợp similarity + rating + kinh nghiệm
    4. Explain           : sinh lý do đề xuất để kết quả không phải "hộp đen" (NFR-6)

Dữ liệu nằm ở hai DB vì mỗi service sở hữu phần việc của mình: vector ở matching_db
(của matching-service), dữ kiện hồ sơ ở profile_db (của profile-service, đọc
read-only). Bước 1 vì vậy chạy hai truy vấn: pgvector lọc ra danh sách ID ứng viên
trong matching_db, rồi lấy đúng vài chục dòng hồ sơ tương ứng từ profile_db. Không
vector nào phải truyền qua mạng và HNSW index vẫn được dùng như cũ.

Các hàm thuần (hard_filter, re_rank, explain) không truy cập DB để test độc lập.
"""
import re
from collections import Counter

from app.db import get_matching_pool, get_profile_pool
from app.services import index_service

# K mặc định: lấy dư so với limit vì một phần ứng viên sẽ bị hard filter loại bỏ.
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

# Mã lý do loại bỏ — trả về trong thống kê pipeline để giải thích kết quả.
REASON_NOT_VERIFIED = "notVerified"
REASON_UNAVAILABLE = "unavailable"
REASON_NO_SCHEDULE = "noSchedule"
REASON_FULL_CAPACITY = "fullCapacity"
REASON_DOMAIN_MISMATCH = "domainMismatch"


async def get_mentee(mentee_id: str) -> dict | None:
    """Dữ kiện hồ sơ mentee (profile_db, read-only) — dùng cho hard filter & explain."""
    pool = await get_profile_pool()
    row = await pool.fetchrow(
        "SELECT user_id, domain, goal, skills FROM mentee_profiles WHERE user_id = $1::uuid",
        mentee_id,
    )
    return dict(row) if row else None


async def top_k_retrieval(mentee_id: str, k: int = DEFAULT_K) -> list[dict]:
    """
    Top-K retrieval bằng cosine distance của pgvector (toán tử <=>, dùng HNSW index)
    trong matching_db, rồi lấy dữ kiện hồ sơ của đúng K ứng viên đó từ profile_db.
    Vector của mentee được lấy bằng subquery ngay trong DB — không vector nào phải
    truyền qua mạng.
    """
    matching_pool = await get_matching_pool()
    ranked = await matching_pool.fetch(
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
    if not ranked:
        return []

    profile_pool = await get_profile_pool()
    rows = await profile_pool.fetch(
        """
        SELECT m.user_id AS mentor_id, m.display_name, m.domain, m.skills, m.bio,
               m.capacity, m.active_mentee_count, m.is_available, m.rating, m.rating_count,
               m.years_experience, m.hourly_rate, m.verification_status,
               EXISTS (SELECT 1 FROM mentor_availability a WHERE a.mentor_id = m.user_id) AS has_schedule
        FROM mentor_profiles m
        WHERE m.user_id = ANY($1::uuid[])
        """,
        [r["mentor_id"] for r in ranked],
    )
    profiles = {r["mentor_id"]: dict(r) for r in rows}

    # Giữ nguyên thứ tự theo khoảng cách vector. Mentor có trong chỉ mục nhưng
    # không còn hồ sơ (vừa bị xoá) thì bỏ qua — IndexSyncJob sẽ dọn chỉ mục.
    candidates = []
    for r in ranked:
        profile = profiles.get(r["mentor_id"])
        if profile is None:
            continue
        profile["distance"] = r["distance"]
        candidates.append(profile)
    return candidates


def rejection_reason(candidate: dict, mentee_domain: str | None) -> str | None:
    """Trả về mã lý do nếu mentor không thoả ràng buộc cứng, None nếu hợp lệ."""
    if candidate.get("verification_status") != "APPROVED":
        return REASON_NOT_VERIFIED  # chưa vượt qua AI Interview + admin duyệt
    if not candidate.get("is_available"):
        return REASON_UNAVAILABLE
    if not candidate.get("has_schedule"):
        return REASON_NO_SCHEDULE  # chưa khai báo lịch rảnh => không thể đặt lịch
    if candidate.get("active_mentee_count", 0) >= candidate.get("capacity", 0):
        return REASON_FULL_CAPACITY
    if mentee_domain and (candidate.get("domain") or "").strip().lower() != mentee_domain.strip().lower():
        return REASON_DOMAIN_MISMATCH
    return None


def hard_filter(candidates: list[dict], mentee_domain: str | None) -> tuple[list[dict], dict[str, int]]:
    """Loại mentor không đủ điều kiện thực tế; trả về (danh sách còn lại, thống kê lý do loại)."""
    kept: list[dict] = []
    excluded: Counter[str] = Counter()
    for c in candidates:
        reason = rejection_reason(c, mentee_domain)
        if reason is None:
            kept.append(c)
        else:
            excluded[reason] += 1
    return kept, dict(excluded)


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


async def match_mentors_for_mentee(mentee_id: str, limit: int = 10) -> dict | None:
    """Chạy toàn bộ pipeline. Trả về None nếu mentee chưa có hồ sơ/embedding."""
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

    k = max(DEFAULT_K, limit * 5)
    candidates = await top_k_retrieval(mentee_id, k=k)
    filtered, excluded = hard_filter(candidates, mentee["domain"])
    ranked = re_rank(filtered)[:limit]
    for c in ranked:
        c["reasons"], c["matched_skills"] = explain(c, mentee)

    return {
        "mentors": ranked,
        "stats": {
            "retrieved": len(candidates),
            "excluded": excluded,
            "returned": len(ranked),
            "k": k,
        },
    }
