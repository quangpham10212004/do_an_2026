"""
Migration CSDL ai_db: các file `ai-service/migrations/NNN_ten.sql` được áp lúc khởi động theo thứ tự số.

- `001_baseline.sql` = `db/init/ai-service.sql` (toàn bộ `CREATE ... IF NOT EXISTS`): với volume đã được
  db/init tạo bảng thì file này không làm gì, chỉ được ghi nhận là đã áp.
- Mỗi file chạy trong một transaction riêng và được ghi vào `schema_migrations(version, name, applied_at)`;
  file đã áp không bao giờ chạy lại — muốn đổi schema thì thêm file số tiếp theo, KHÔNG sửa file cũ.
- `pg_advisory_lock` bảo đảm nhiều instance khởi động cùng lúc không áp trùng.
Quy trình chung cho mọi service: docs/deployment-guide.md §8.
"""
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path

import asyncpg

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(os.getenv("AI_MIGRATIONS_DIR", str(Path(__file__).resolve().parents[1] / "migrations")))
_FILE = re.compile(r"^(\d{3,})_([A-Za-z0-9_\-]+)\.sql$")
_LOCK_KEY = 0x41495F4D4947  # hằng số tuỳ ý cho pg_advisory_lock ("AI_MIG")


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path


def discover(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    """Danh sách migration sắp theo số phiên bản; tên file sai quy ước hoặc trùng số => lỗi ngay."""
    found: dict[int, Migration] = {}
    for path in sorted(directory.glob("*.sql")):
        m = _FILE.match(path.name)
        if m is None:
            raise ValueError(f"Tên file migration không hợp lệ (cần NNN_ten.sql): {path.name}")
        version = int(m.group(1))
        if version in found:
            raise ValueError(f"Trùng số migration {version}: {found[version].path.name}, {path.name}")
        found[version] = Migration(version, m.group(2), path)
    return [found[v] for v in sorted(found)]


async def apply(conn: asyncpg.Connection, directory: Path = MIGRATIONS_DIR) -> list[int]:
    """Áp các migration chưa chạy; trả về danh sách phiên bản vừa áp."""
    migrations = discover(directory)
    await conn.execute("SELECT pg_advisory_lock($1)", _LOCK_KEY)
    try:
        await conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                                  version     INTEGER PRIMARY KEY,
                                  name        TEXT NOT NULL,
                                  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now())""")
        done = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations")}
        applied = []
        for m in migrations:
            if m.version in done:
                continue
            async with conn.transaction():
                await conn.execute(m.path.read_text(encoding="utf-8"))
                await conn.execute("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
                                   m.version, m.name)
            log.info("Applied ai_db migration %03d_%s", m.version, m.name)
            applied.append(m.version)
        return applied
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _LOCK_KEY)
