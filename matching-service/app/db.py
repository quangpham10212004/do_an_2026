import os
import asyncpg

# Ngoại lệ đã được duyệt: matching-service đọc TRỰC TIẾP (read-only) DB của
# profile-service để lấy cột embedding, tránh truyền vector lớn qua HTTP.
# Xem CONVENTIONS.md mục 6. Không được ghi (INSERT/UPDATE/DELETE) qua kết
# nối này — mọi write vào profile phải qua API của profile-service.
PROFILE_DB_URL = os.getenv(
    "PROFILE_DB_URL",
    "postgresql://postgres:postgres@localhost:5434/profile_db",
)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(PROFILE_DB_URL, min_size=1, max_size=5)
    return _pool
