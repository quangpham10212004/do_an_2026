"""US-11 — migration ai_db: thứ tự file, idempotent, baseline trên volume do db/init tạo."""
import asyncio
import pathlib
import uuid

import asyncpg
import pytest

from app import config, migrations

DB_INIT = pathlib.Path(__file__).resolve().parents[2] / "db" / "init" / "ai-service.sql"


def test_discover_orders_by_number_and_starts_with_baseline():
    found = migrations.discover()
    assert found[0].version == 1 and found[0].name == "baseline"
    assert [m.version for m in found] == sorted(m.version for m in found)


def test_baseline_is_identical_to_db_init():
    """001_baseline phải đúng bằng db/init để volume cũ (tạo bằng db/init) baseline được không lỗi."""
    assert migrations.discover()[0].path.read_text() == DB_INIT.read_text()


@pytest.mark.parametrize("name", ["1_short.sql", "abc_x.sql", "002 bad.sql"])
def test_discover_rejects_bad_file_names(tmp_path, name):
    (tmp_path / name).write_text("SELECT 1;")
    with pytest.raises(ValueError):
        migrations.discover(tmp_path)


def test_discover_rejects_duplicate_numbers(tmp_path):
    (tmp_path / "002_a.sql").write_text("SELECT 1;")
    (tmp_path / "002_b.sql").write_text("SELECT 1;")
    with pytest.raises(ValueError):
        migrations.discover(tmp_path)


async def _with_temp_database(fn):
    admin = await asyncpg.connect(config.AI_DB_URL)
    name = f"mig_test_{uuid.uuid4().hex[:8]}"
    await admin.execute(f"CREATE DATABASE {name}")
    try:
        base, _, _ = config.AI_DB_URL.rpartition("/")
        conn = await asyncpg.connect(f"{base}/{name}")
        try:
            return await fn(conn)
        finally:
            await conn.close()
    finally:
        await admin.execute(f"DROP DATABASE IF EXISTS {name}")
        await admin.close()


def _run(fn):
    try:
        return asyncio.run(_with_temp_database(fn))
    except OSError as e:
        pytest.skip(f"Không kết nối được Postgres ({config.AI_DB_URL}): {e}")


def test_existing_db_init_volume_is_baselined_then_upgraded():
    async def scenario(conn):
        await conn.execute(DB_INIT.read_text())          # volume cũ: chỉ có db/init, chưa có schema_migrations
        first = await migrations.apply(conn)
        second = await migrations.apply(conn)            # khởi động lại: không áp gì thêm
        rows = await conn.fetch("SELECT version FROM schema_migrations ORDER BY version")
        return first, second, [r["version"] for r in rows]

    first, second, recorded = _run(scenario)
    all_versions = [m.version for m in migrations.discover()]
    assert first == all_versions and second == [] and recorded == all_versions


def test_failed_migration_is_rolled_back_and_not_recorded(tmp_path):
    (tmp_path / "001_ok.sql").write_text("CREATE TABLE t_ok (id INT);")
    (tmp_path / "002_broken.sql").write_text("CREATE TABLE t_broken (id INT); SELECT * FROM missing_table;")

    async def scenario(conn):
        with pytest.raises(asyncpg.PostgresError):
            await migrations.apply(conn, tmp_path)
        rows = await conn.fetch("SELECT version FROM schema_migrations")
        broken = await conn.fetchval("SELECT to_regclass('t_broken')")
        return [r["version"] for r in rows], broken

    recorded, broken_table = _run(scenario)
    assert recorded == [1] and broken_table is None
