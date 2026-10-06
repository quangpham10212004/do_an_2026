"""
Dựng schema cho test CSDL thật từ CHÍNH các migration của repo (US-11), thay vì db/init:

- matching_db: runner `app.migrations` (matching-service/migrations/NNN_*.sql).
- profile_db:  các file Flyway của profile-service (V1__baseline.sql, V2__..., ...) chạy theo
  thứ tự version trên schema public được tạo lại — đúng schema mà profile-service có sau khi
  khởi động, gồm cả các cột mới matching-service đọc (status, languages, ...).
"""
import pathlib
import re

import asyncpg

from app import migrations

_ROOT = pathlib.Path(__file__).resolve().parents[2]
PROFILE_MIGRATIONS = _ROOT / "profile-service" / "src" / "main" / "resources" / "db" / "migration"
_FLYWAY_RE = re.compile(r"^V(\d+)__.+\.sql$")


def profile_migration_files() -> list[pathlib.Path]:
    files = [p for p in PROFILE_MIGRATIONS.glob("V*.sql") if _FLYWAY_RE.match(p.name)]
    return sorted(files, key=lambda p: int(_FLYWAY_RE.match(p.name).group(1)))


async def reset_profile_db(admin: asyncpg.Connection) -> None:
    """Xoá sạch schema public của profile_db rồi chạy lại toàn bộ migration Flyway."""
    await admin.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    for path in profile_migration_files():
        await admin.execute(path.read_text(encoding="utf-8"))


async def migrate_matching_db(conn: asyncpg.Connection) -> None:
    await migrations.apply(conn)
