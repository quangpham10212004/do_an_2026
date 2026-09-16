import asyncpg

from app import config

# Ngoại lệ đã được duyệt: matching-service đọc TRỰC TIẾP (read-only) DB của
# profile-service để tính khoảng cách vector ngay trong PostgreSQL, tránh truyền
# vector lớn qua HTTP. Xem CONVENTIONS.md mục 7. Kết nối dùng role
# `matching_reader` chỉ có quyền SELECT — mọi write phải qua API profile-service.

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(config.PROFILE_DB_URL, min_size=1, max_size=5)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
