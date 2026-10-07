"""
US-11 — migration CSDL của matching-service (matching_db).

File SQL đánh số trong `matching-service/migrations/NNN_ten.sql` được áp dụng theo thứ tự lúc
khởi động; mỗi file chạy trong một transaction riêng và được ghi vào bảng `schema_migrations`
(version, name, checksum). File đã áp dụng thì bỏ qua; nếu nội dung file đã áp dụng bị sửa
(checksum lệch) thì từ chối khởi động — thay đổi schema phải viết thành file mới.

Nhiều instance cùng khởi động được tuần tự hoá bằng `pg_advisory_lock`.

`001_baseline.sql` là bản sao `db/init/matching-service.sql` (idempotent), nên CSDL đã được tạo
bằng db/init vẫn áp dụng được mà không mất dữ liệu.
"""
import hashlib
import logging
import pathlib
import re

import asyncpg

log = logging.getLogger(__name__)

MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parents[1] / "migrations"
_FILE_RE = re.compile(r"^(\d{3})_([a-z0-9_]+)\.sql$")
# Khoá advisory cố định cho runner (số bất kỳ, chỉ cần không trùng khoá khác trong matching_db).
_LOCK_KEY = 72_090_011


class MigrationError(RuntimeError):
    pass


def discover(directory: pathlib.Path = MIGRATIONS_DIR) -> list[tuple[str, str, str]]:
    """Danh sách (version, name, sql) theo thứ tự version. Tên file sai format => lỗi."""
    found = []
    for path in sorted(directory.glob("*.sql")):
        match = _FILE_RE.match(path.name)
        if not match:
            raise MigrationError(f"Tên file migration không hợp lệ (cần NNN_ten.sql): {path.name}")
        found.append((match.group(1), match.group(2), path.read_text(encoding="utf-8")))
    versions = [v for v, _, _ in found]
    if len(versions) != len(set(versions)):
        raise MigrationError("Trùng số version migration")
    return found


def checksum(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


async def apply(conn: asyncpg.Connection, directory: pathlib.Path = MIGRATIONS_DIR) -> list[str]:
    """Áp dụng các migration chưa chạy. Trả về danh sách version vừa áp dụng."""
    migrations = discover(directory)
    await conn.execute("SELECT pg_advisory_lock($1)", _LOCK_KEY)
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version     TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                checksum    TEXT NOT NULL,
                applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        applied = {r["version"]: r["checksum"] for r in await conn.fetch("SELECT version, checksum FROM schema_migrations")}
        done = []
        for version, name, sql in migrations:
            digest = checksum(sql)
            if version in applied:
                if applied[version] != digest:
                    raise MigrationError(
                        f"Migration {version}_{name} đã áp dụng nhưng nội dung file bị sửa — hãy tạo file mới"
                    )
                continue
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
                    version, name, digest,
                )
            log.info("Đã áp dụng migration %s_%s", version, name)
            done.append(version)
        return done
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _LOCK_KEY)


async def apply_with_pool(pool: asyncpg.Pool) -> list[str]:
    async with pool.acquire() as conn:
        return await apply(conn)
