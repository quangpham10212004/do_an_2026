"""
Pool kết nối tới CSDL riêng của ai-service (ai_db).

ai-service sở hữu dữ liệu của 3 tính năng AI: buổi phỏng vấn + từng lượt hỏi-đáp,
CV đã parse, hội thoại enrichment. Không service nào khác ghi vào các bảng này —
dữ liệu cần cho service khác được ai-service chủ động đẩy đi (profile-service,
mentoring-service) qua endpoint nội bộ.
"""
import asyncpg

from app import config

# Repository nhận `Db`: một connection (khi đang trong transaction) hoặc chính pool
# (asyncpg.Pool proxy sẵn fetch/fetchrow/execute và tự mượn/trả connection).
Db = asyncpg.Connection | asyncpg.Pool

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(config.AI_DB_URL, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
