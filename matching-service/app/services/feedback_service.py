"""
US-36 (PRD-MATCH-6, PRD-MATCH-8) — phản hồi "Không phù hợp" và nhật ký hiển thị (matching_db).

- Ẩn mentor khỏi gợi ý của đúng mentee đó trong 30 ngày (pipeline loại các mentor đang bị ẩn TRƯỚC khi xếp hạng,
  nên vẫn trả đủ `limit` kết quả). Bấm lại khi đang ẩn = cập nhật lý do và gia hạn 30 ngày từ lúc bấm.
- Mỗi lần trả danh sách ghi match_impressions (best-effort: lỗi ghi log không làm hỏng lượt tìm).
"""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from app import config
from app.db import get_matching_pool

log = logging.getLogger(__name__)

HIDE_DAYS = 30
REASONS = ("WRONG_DOMAIN", "TOO_EXPENSIVE", "SCHEDULE", "OTHER")


async def hidden_mentor_ids(mentee_id: str, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    pool = await get_matching_pool()
    rows = await pool.fetch(
        """
        SELECT DISTINCT mentor_id FROM match_feedback
        WHERE mentee_id = $1::uuid AND revoked_at IS NULL AND hidden_until > $2
        """,
        mentee_id, now,
    )
    return [str(r["mentor_id"]) for r in rows]


async def hide(mentee_id: str, mentor_id: str, reason: str, note: str | None, impression_id: str | None,
               now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    until = now + timedelta(days=HIDE_DAYS)
    pool = await get_matching_pool()
    async with pool.acquire() as conn, conn.transaction():
        rank = None
        if impression_id:
            rank = await conn.fetchval(
                "SELECT rank FROM match_impressions WHERE impression_id = $1::uuid AND mentor_id = $2::uuid "
                "AND mentee_id = $3::uuid LIMIT 1",
                impression_id, mentor_id, mentee_id,
            )
            if rank is None:
                impression_id = None  # impression không thuộc mentee/mentor này — bỏ, không tin client
        # Lượt ẩn đang hiệu lực (nếu có) được đóng lại để mỗi cặp chỉ có 1 dòng hiệu lực.
        await conn.execute(
            "UPDATE match_feedback SET revoked_at = $3 WHERE mentee_id = $1::uuid AND mentor_id = $2::uuid "
            "AND revoked_at IS NULL AND hidden_until > $3",
            mentee_id, mentor_id, now,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO match_feedback (mentee_id, mentor_id, reason, note, impression_id, rank, created_at, hidden_until)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8)
            RETURNING id, mentor_id, reason, note, rank, created_at, hidden_until
            """,
            mentee_id, mentor_id, reason, note, impression_id, rank, now, until,
        )
    return dict(row)


async def active_feedback(mentee_id: str, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    pool = await get_matching_pool()
    rows = await pool.fetch(
        """
        SELECT id, mentor_id, reason, note, rank, created_at, hidden_until FROM match_feedback
        WHERE mentee_id = $1::uuid AND revoked_at IS NULL AND hidden_until > $2
        ORDER BY created_at DESC
        """,
        mentee_id, now,
    )
    return [dict(r) for r in rows]


async def unhide(mentee_id: str, mentor_id: str, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    pool = await get_matching_pool()
    result = await pool.execute(
        "UPDATE match_feedback SET revoked_at = $3 WHERE mentee_id = $1::uuid AND mentor_id = $2::uuid "
        "AND revoked_at IS NULL AND hidden_until > $3",
        mentee_id, mentor_id, now,
    )
    return int(result.split()[-1])


async def log_impressions(mentee_id: str, mentors: list[dict], filters: dict, weights: dict) -> str | None:
    """Ghi danh sách vừa trả về; trả impression_id (None khi danh sách rỗng hoặc ghi lỗi)."""
    if not mentors:
        return None
    impression_id = str(uuid.uuid4())
    rows = [
        (impression_id, mentee_id, str(m["mentor_id"]), rank, float(m["final_score"]),
         json.dumps(m.get("score_parts") or {}), json.dumps(filters, default=str), json.dumps(weights),
         config.EMBEDDING_MODEL)
        for rank, m in enumerate(mentors, start=1)
    ]
    try:
        pool = await get_matching_pool()
        await pool.executemany(
            """
            INSERT INTO match_impressions (impression_id, mentee_id, mentor_id, rank, final_score, score_parts, filters,
                                           weights, model)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
            """,
            rows,
        )
    except Exception as e:  # noqa: BLE001 — nhật ký không được làm hỏng lượt tìm
        log.warning("Could not log match impressions for mentee %s: %s", mentee_id, e)
        return None
    return impression_id


async def evaluation_stats(days: int, max_rank: int = 10) -> dict:
    """
    ADMIN — số liệu đánh giá online trong `days` ngày: theo hạng (1..max_rank) số lượt hiển thị và số lượt "Không phù
    hợp"; phân bố lý do. Tỉ lệ được gửi yêu cầu theo hạng cần dữ liệu mentoring-service — tính offline bằng
    scripts/eval/matching (xuất impressions qua endpoint này + yêu cầu mentoring).
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_matching_pool()
    async with pool.acquire() as conn:
        shown = await conn.fetch(
            "SELECT rank, count(*) AS n FROM match_impressions WHERE created_at >= $1 AND rank <= $2 GROUP BY rank",
            since, max_rank,
        )
        rejected = await conn.fetch(
            "SELECT rank, count(*) AS n FROM match_feedback WHERE created_at >= $1 AND rank IS NOT NULL AND rank <= $2 "
            "GROUP BY rank",
            since, max_rank,
        )
        reasons = await conn.fetch(
            "SELECT reason, count(*) AS n FROM match_feedback WHERE created_at >= $1 GROUP BY reason", since,
        )
        lists = await conn.fetchval(
            "SELECT count(DISTINCT impression_id) FROM match_impressions WHERE created_at >= $1", since,
        )
    shown_by = {r["rank"]: r["n"] for r in shown}
    rejected_by = {r["rank"]: r["n"] for r in rejected}
    by_rank = []
    for rank in range(1, max_rank + 1):
        n, bad = shown_by.get(rank, 0), rejected_by.get(rank, 0)
        by_rank.append({"rank": rank, "impressions": n, "notRelevant": bad,
                        "notRelevantRate": round(bad / n, 4) if n else 0.0})
    return {
        "days": days,
        "resultLists": lists or 0,
        "byRank": by_rank,
        "reasons": {r["reason"]: r["n"] for r in reasons},
    }
