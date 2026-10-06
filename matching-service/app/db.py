import asyncpg

from app import config

# matching-service dùng HAI pool:
#
#   matching_db  (read-write) — DB của chính nó, chứa chỉ mục embedding.
#   profile_db   (read-only)  — ngoại lệ kiến trúc đã được duyệt (CONVENTIONS.md
#                               mục 7): đọc trực tiếp mentor_profiles,
#                               mentee_profiles, mentor_availability bằng role
#                               `matching_reader` chỉ có quyền SELECT. Mọi thao
#                               tác ghi vào hồ sơ đều phải qua API profile-service.

_matching_pool: asyncpg.Pool | None = None
_profile_pool: asyncpg.Pool | None = None


async def get_matching_pool() -> asyncpg.Pool:
    global _matching_pool
    if _matching_pool is None:
        _matching_pool = await asyncpg.create_pool(config.MATCHING_DB_URL, min_size=1, max_size=5)
    return _matching_pool


async def get_profile_pool() -> asyncpg.Pool:
    global _profile_pool
    if _profile_pool is None:
        _profile_pool = await asyncpg.create_pool(config.PROFILE_DB_URL, min_size=1, max_size=5)
    return _profile_pool


async def close_pools() -> None:
    global _matching_pool, _profile_pool
    for pool in (_matching_pool, _profile_pool):
        if pool is not None:
            await pool.close()
    _matching_pool = None
    _profile_pool = None
