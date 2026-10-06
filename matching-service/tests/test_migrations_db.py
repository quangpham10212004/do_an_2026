"""
US-11 — runner migration trên PostgreSQL THẬT (pgvector). Cần MATCHING_DB_URL trỏ tới CSDL
DÙNG MỘT LẦN (test tạo/xoá bảng). Thiếu biến => skip khi local, FAIL trên CI (giống test_index_db.py).
"""
import os

import asyncpg
import pytest

from app import migrations

if not os.getenv("MATCHING_DB_URL"):
    if os.getenv("CI"):
        raise RuntimeError("CI phải cấp MATCHING_DB_URL cho test migration")
    pytest.skip("cần CSDL thật, thiếu biến: MATCHING_DB_URL", allow_module_level=True)

pytestmark = pytest.mark.anyio

_PROBE_VERSIONS = ["900", "901", "950"]


@pytest.fixture
async def conn():
    c = await asyncpg.connect(os.environ["MATCHING_DB_URL"])
    await migrations.apply(c)  # schema thật của repo (idempotent)
    await c.execute("DELETE FROM schema_migrations WHERE version = ANY($1::text[])", _PROBE_VERSIONS)
    await c.execute("DROP TABLE IF EXISTS mig_probe, mig_broken")
    try:
        yield c
    finally:
        await c.execute("DROP TABLE IF EXISTS mig_probe, mig_broken")
        await c.execute("DELETE FROM schema_migrations WHERE version = ANY($1::text[])", _PROBE_VERSIONS)
        await c.close()


async def test_applies_repository_migrations_idempotently(conn):
    assert await migrations.apply(conn) == []
    versions = [r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations ORDER BY version")]
    assert versions[0] == "001"
    assert await conn.fetchval("SELECT to_regclass('mentor_embeddings') IS NOT NULL")


async def test_applies_new_files_in_order_and_rejects_edited_ones(conn, tmp_path):
    (tmp_path / "900_create_probe.sql").write_text("CREATE TABLE mig_probe (id INT PRIMARY KEY);")
    (tmp_path / "901_insert_probe.sql").write_text("INSERT INTO mig_probe VALUES (1);")
    assert await migrations.apply(conn, tmp_path) == ["900", "901"]
    assert await migrations.apply(conn, tmp_path) == []
    assert await conn.fetchval("SELECT count(*) FROM mig_probe") == 1

    (tmp_path / "901_insert_probe.sql").write_text("INSERT INTO mig_probe VALUES (2);")
    with pytest.raises(migrations.MigrationError):
        await migrations.apply(conn, tmp_path)


async def test_failed_migration_is_rolled_back(conn, tmp_path):
    (tmp_path / "950_broken.sql").write_text("CREATE TABLE mig_broken (id INT); SELECT * FROM khong_ton_tai;")
    with pytest.raises(asyncpg.UndefinedTableError):
        await migrations.apply(conn, tmp_path)
    assert not await conn.fetchval("SELECT to_regclass('mig_broken') IS NOT NULL")
    assert not await conn.fetchval("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '950')")
