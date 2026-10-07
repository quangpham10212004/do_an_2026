"""US-11 — runner migration của matching_db: phần không cần CSDL (đặt tên file, checksum)."""
import pytest

from app import migrations


def test_repository_migrations_are_well_formed():
    found = migrations.discover()
    assert found[0][0] == "001" and found[0][1] == "baseline"
    assert [v for v, _, _ in found] == sorted(v for v, _, _ in found)


def test_baseline_matches_db_init_schema():
    """001_baseline phải chứa đúng schema của db/init (CSDL cũ áp dụng lại được, không mất dữ liệu)."""
    baseline = (migrations.MIGRATIONS_DIR / "001_baseline.sql").read_text()
    init = (migrations.MIGRATIONS_DIR.parents[1] / "db" / "init" / "matching-service.sql").read_text()
    assert init.strip() in baseline


def test_rejects_badly_named_files(tmp_path):
    (tmp_path / "001_ok.sql").write_text("SELECT 1;")
    (tmp_path / "2_bad.sql").write_text("SELECT 1;")
    with pytest.raises(migrations.MigrationError):
        migrations.discover(tmp_path)


def test_rejects_duplicate_versions(tmp_path):
    (tmp_path / "001_a.sql").write_text("SELECT 1;")
    (tmp_path / "001_b.sql").write_text("SELECT 1;")
    with pytest.raises(migrations.MigrationError):
        migrations.discover(tmp_path)


def test_checksum_changes_with_content():
    assert migrations.checksum("a") != migrations.checksum("b")
