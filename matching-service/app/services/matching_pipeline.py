from app.db import get_pool

DEFAULT_K = 20

# Trọng số re-rank — giá trị mặc định, cần thử nghiệm và ghi lại lý do
# chọn trong báo cáo đồ án (xem prompt gốc: "đừng tự ý đổi kiến trúc tổng
# thể nếu chưa rõ, dùng mặc định hợp lý và note lại").
WEIGHT_SIMILARITY = 0.7
WEIGHT_RATING = 0.2
WEIGHT_EXPERIENCE = 0.1
MAX_YEARS_EXPERIENCE_NORM = 10  # dùng để chuẩn hóa years_experience về [0,1]


async def get_mentee_embedding(mentee_id: str) -> list[float] | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT embedding FROM mentee_profiles WHERE user_id = $1",
        mentee_id,
    )
    return row["embedding"] if row else None


async def top_k_retrieval(mentee_embedding: list[float], k: int = DEFAULT_K) -> list[dict]:
    """Top-K retrieval bằng cosine distance của pgvector (toán tử <=>)."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT user_id AS mentor_id, display_name, domain, capacity,
               is_available, rating, years_experience,
               embedding <=> $1 AS distance
        FROM mentor_profiles
        ORDER BY distance ASC
        LIMIT $2
        """,
        mentee_embedding,
        k,
    )
    return [dict(r) for r in rows]


def hard_filter(candidates: list[dict], mentee_domain: str) -> list[dict]:
    """Loại mentor không đủ điều kiện thực tế: hết slot, không rảnh, sai domain."""
    return [
        c for c in candidates
        if c["capacity"] > 0
        and c["is_available"]
        and c["domain"] == mentee_domain
    ]


def re_rank(candidates: list[dict]) -> list[dict]:
    for c in candidates:
        similarity = 1 - c["distance"]
        experience_norm = min(c["years_experience"] / MAX_YEARS_EXPERIENCE_NORM, 1.0)
        c["similarity_score"] = similarity
        c["final_score"] = (
            WEIGHT_SIMILARITY * similarity
            + WEIGHT_RATING * (c["rating"] / 5)
            + WEIGHT_EXPERIENCE * experience_norm
        )
    return sorted(candidates, key=lambda x: x["final_score"], reverse=True)


async def match_mentors_for_mentee(mentee_id: str, limit: int = 10) -> list[dict] | None:
    mentee_embedding = await get_mentee_embedding(mentee_id)
    if mentee_embedding is None:
        return None

    # TODO: lấy domain thật của mentee từ DB thay vì giả định — hiện tại
    # skeleton cần bổ sung 1 query lấy mentee_profiles.domain trước khi
    # gọi hard_filter.
    candidates = await top_k_retrieval(mentee_embedding, k=DEFAULT_K)
    filtered = candidates  # TODO: gọi hard_filter(candidates, mentee_domain)
    ranked = re_rank(filtered)
    return ranked[:limit]
