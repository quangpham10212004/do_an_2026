"""
Pool kết nối tới CSDL riêng của ai-service (ai_db).

ai-service sở hữu dữ liệu của 3 tính năng AI: buổi phỏng vấn + từng lượt hỏi-đáp,
CV đã parse, hội thoại enrichment. Không service nào khác ghi vào các bảng này —
dữ liệu cần cho service khác được ai-service chủ động đẩy đi (profile-service,
mentoring-service) qua endpoint nội bộ.

Lần đầu tạo pool, các migration trong `ai-service/migrations/` được áp TRƯỚC khi pool được
trả về cho bất kỳ truy vấn nào (app/migrations.py), nên code luôn chạy trên schema mới nhất.
"""
import asyncio

import asyncpg

from app import config, migrations

# Repository nhận `Db`: một connection (khi đang trong transaction) hoặc chính pool
# (asyncpg.Pool proxy sẵn fetch/fetchrow/execute và tự mượn/trả connection).
Db = asyncpg.Connection | asyncpg.Pool

_pool: asyncpg.Pool | None = None
_lock: asyncio.Lock | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool, _lock
    if _pool is not None:
        return _pool
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _pool is None:
            pool = await asyncpg.create_pool(config.AI_DB_URL, min_size=1, max_size=10)
            try:
                async with pool.acquire() as conn:
                    await migrations.apply(conn)
            except BaseException:
                await pool.close()
                raise
            _pool = pool
    return _pool


async def close_pool() -> None:
    global _pool, _lock
    if _pool is not None:
        await _pool.close()
        _pool = None
    _lock = None
