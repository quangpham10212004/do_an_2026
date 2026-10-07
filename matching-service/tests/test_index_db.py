"""
IndexSyncJob (reconcile) chạy trên PostgreSQL THẬT — bổ sung cho test_index_service.py
(bản dùng DB giả). Kiểm tra đúng những gì DB giả không bắt được: SQL thật, ép kiểu
`$2::text::vector`, quyền của role `matching_reader` và việc dọn chỉ mục mồ côi khi
hồ sơ bị xoá khỏi profile_db (không có FK giữa 2 database).

Cần 3 biến môi trường, trỏ tới DB DÙNG MỘT LẦN (test TRUNCATE các bảng):
    MATCHING_DB_URL       matching_db (image pgvector, superuser để CREATE EXTENSION)
    PROFILE_DB_URL        profile_db qua role matching_reader (như khi chạy thật)
                          — role do db/init/profile-service.sql tạo khi test nạp schema
    PROFILE_DB_ADMIN_URL  profile_db bằng superuser — chỉ để test seed/xoá hồ sơ
Thiếu biến => skip khi chạy local; trên CI (biến CI được đặt) thì FAIL để không
bao giờ skip âm thầm. Không dùng giá trị mặc định trong config.py vì chúng trỏ vào
DB của docker compose đang chạy.
"""
import hashlib
import os
import uuid

import asyncpg
import pytest

from app import db
from app.services import index_service
from app.services.embedding_service import EMBEDDING_DIM
from app.services.profile_text import MENTEE, MENTOR, normalize, text_hash
from tests.schema import migrate_matching_db, reset_profile_db

_REQUIRED = ("MATCHING_DB_URL", "PROFILE_DB_URL", "PROFILE_DB_ADMIN_URL")
_MISSING = [name for name in _REQUIRED if not os.getenv(name)]

if _MISSING:
    if os.getenv("CI"):
        raise RuntimeError(f"CI phải cấp CSDL cho test chỉ mục, thiếu: {', '.join(_MISSING)}")
    pytest.skip(f"cần CSDL thật, thiếu biến: {', '.join(_MISSING)}", allow_module_level=True)

pytestmark = pytest.mark.anyio


def _fake_vector(text: str) -> list[float]:
    """Vector giả 384 chiều, tất định theo text — không cần load model."""
    seed = hashlib.sha256(text.encode()).digest()
    return [(seed[i % len(seed)] - 128) / 128 for i in range(EMBEDDING_DIM)]


@pytest.fixture
async def dbs(monkeypatch):
    """Dọn sạch 2 DB trước mỗi test và đếm số lần gọi model."""
    calls = []

    def embed(text):
        calls.append(text)
        return _fake_vector(text)

    monkeypatch.setattr(index_service, "embed_text", embed)

    admin = await asyncpg.connect(os.environ["PROFILE_DB_ADMIN_URL"])
    matching = await asyncpg.connect(os.environ["MATCHING_DB_URL"])
    # Schema dựng từ chính migration của repo (US-11): Flyway của profile-service, runner của matching.
    await reset_profile_db(admin)
    await migrate_matching_db(matching)
    await matching.execute("TRUNCATE mentor_embeddings, mentee_embeddings")
    try:
        yield {"profile": admin, "matching": matching, "embed_calls": calls}
    finally:
        await admin.close()
        await matching.close()
        # Pool của app gắn với event loop của test này — đóng để test sau tạo lại.
        await db.close_pools()


async def _add_mentor(conn, bio="Kỹ sư backend", domain="backend") -> str:
    user_id = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO mentor_profiles (user_id, display_name, skills, domain, bio, years_experience) "
        "VALUES ($1::uuid, 'Mentor', $2, $3, $4, 5)",
        user_id, ["Java", "Spring Boot"], domain, bio,
    )
    return user_id


async def _add_mentee(conn, goal="Học system design") -> str:
    user_id = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO mentee_profiles (user_id, display_name, domain, skills, goal) "
        "VALUES ($1::uuid, 'Mentee', 'backend', $2, $3)",
        user_id, ["Java"], goal,
    )
    return user_id


async def _index_row(conn, table: str, user_id: str):
    return await conn.fetchrow(
        f"SELECT text_hash, attempts, last_error, embedding IS NOT NULL AS has_vector "
        f"FROM {table} WHERE user_id = $1::uuid",
        user_id,
    )


async def _expected_hash(conn, role: str, user_id: str) -> str:
    table, cols = (
        ("mentor_profiles", "user_id, domain, skills, years_experience, bio") if role == MENTOR
        else ("mentee_profiles", "user_id, domain, skills, current_level, goal")
    )
    row = await conn.fetchrow(f"SELECT {cols} FROM {table} WHERE user_id = $1::uuid", user_id)
    return text_hash(normalize(role, dict(row)))


async def test_reconcile_indexes_new_profiles_then_is_idempotent(dbs):
    mentor_id = await _add_mentor(dbs["profile"])
    mentee_id = await _add_mentee(dbs["profile"])

    stats = await index_service.reconcile(batch=100)
    assert stats == {"reindexed": 2, "pending": 0, "pruned": 0, "stale": 2}

    mentor_row = await _index_row(dbs["matching"], "mentor_embeddings", mentor_id)
    assert mentor_row["has_vector"]
    assert mentor_row["text_hash"] == await _expected_hash(dbs["profile"], MENTOR, mentor_id)
    mentee_row = await _index_row(dbs["matching"], "mentee_embeddings", mentee_id)
    assert mentee_row["has_vector"]
    assert mentee_row["text_hash"] == await _expected_hash(dbs["profile"], MENTEE, mentee_id)

    # NFR-7 — vòng sau không có gì đổi thì không chạy model lại.
    dbs["embed_calls"].clear()
    stats = await index_service.reconcile(batch=100)
    assert stats == {"reindexed": 0, "pending": 0, "pruned": 0, "stale": 0}
    assert dbs["embed_calls"] == []


async def test_reconcile_reembeds_profile_whose_text_changed(dbs):
    changed = await _add_mentor(dbs["profile"], bio="Bio cũ")
    untouched = await _add_mentor(dbs["profile"], bio="Không đổi")
    await index_service.reconcile(batch=100)
    old_hash = (await _index_row(dbs["matching"], "mentor_embeddings", changed))["text_hash"]

    # Hồ sơ được sửa mà thông báo best-effort từ profile-service bị mất.
    await dbs["profile"].execute(
        "UPDATE mentor_profiles SET bio = 'Bio mới về Kafka' WHERE user_id = $1::uuid", changed
    )
    assert (await index_service.status(changed, role=MENTOR)).status == index_service.PENDING

    dbs["embed_calls"].clear()
    stats = await index_service.reconcile(batch=100)
    assert stats["stale"] == 1 and stats["reindexed"] == 1
    assert len(dbs["embed_calls"]) == 1 and "Kafka" in dbs["embed_calls"][0]

    new_hash = (await _index_row(dbs["matching"], "mentor_embeddings", changed))["text_hash"]
    assert new_hash != old_hash
    assert new_hash == await _expected_hash(dbs["profile"], MENTOR, changed)
    assert (await index_service.status(changed, role=MENTOR)).status == index_service.UPDATED
    assert (await index_service.status(untouched, role=MENTOR)).status == index_service.UPDATED


async def test_reconcile_prunes_index_rows_of_deleted_profiles(dbs):
    kept = await _add_mentor(dbs["profile"])
    deleted_mentor = await _add_mentor(dbs["profile"])
    deleted_mentee = await _add_mentee(dbs["profile"])
    await index_service.reconcile(batch=100)

    # Không có FK giữa 2 database: xoá hồ sơ ở profile_db để lại dòng mồ côi trong matching_db.
    await dbs["profile"].execute("DELETE FROM mentor_profiles WHERE user_id = $1::uuid", deleted_mentor)
    await dbs["profile"].execute("DELETE FROM mentee_profiles WHERE user_id = $1::uuid", deleted_mentee)

    stats = await index_service.reconcile(batch=100)
    assert stats["pruned"] == 2
    assert stats["reindexed"] == 0
    assert await _index_row(dbs["matching"], "mentor_embeddings", deleted_mentor) is None
    assert await _index_row(dbs["matching"], "mentee_embeddings", deleted_mentee) is None
    assert (await _index_row(dbs["matching"], "mentor_embeddings", kept))["has_vector"]


async def test_reconcile_keeps_old_vector_on_failure_and_retries_next_round(dbs, monkeypatch):
    mentor_id = await _add_mentor(dbs["profile"], bio="Bio cũ")
    await index_service.reconcile(batch=100)
    await dbs["profile"].execute(
        "UPDATE mentor_profiles SET bio = 'Bio mới' WHERE user_id = $1::uuid", mentor_id
    )

    def boom(text):
        raise RuntimeError("model chưa sẵn sàng")

    monkeypatch.setattr(index_service, "embed_text", boom)
    stats = await index_service.reconcile(batch=100)
    assert stats["pending"] == 1 and stats["reindexed"] == 0
    row = await _index_row(dbs["matching"], "mentor_embeddings", mentor_id)
    assert row["has_vector"]            # vector cũ vẫn còn => matching vẫn chạy được
    assert row["text_hash"] is None     # ...nhưng bị đánh dấu để vòng sau thử lại
    assert row["attempts"] == 1 and "model" in row["last_error"]

    monkeypatch.setattr(index_service, "embed_text", _fake_vector)
    stats = await index_service.reconcile(batch=100)
    assert stats["reindexed"] == 1
    row = await _index_row(dbs["matching"], "mentor_embeddings", mentor_id)
    assert row["text_hash"] == await _expected_hash(dbs["profile"], MENTOR, mentor_id)
    assert row["attempts"] == 0 and row["last_error"] is None


async def test_matching_hides_paused_on_leave_and_suspended_mentors(dbs):
    """US-08 — chỉ mentor có trạng thái HIỆU LỰC ACCEPTING được gợi ý (SQL thật trên schema Flyway)."""
    from app.services import matching_pipeline

    conn = dbs["profile"]
    ids = {}
    for name in ("accepting", "paused", "on_leave", "suspended", "leave_expired"):
        ids[name] = await _add_mentor(conn, bio=f"Kỹ sư backend {name}")
        await conn.execute(
            "UPDATE mentor_profiles SET verification_status = 'APPROVED' WHERE user_id = $1::uuid", ids[name])
        await conn.execute(
            "INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time) "
            "VALUES ($1::uuid, 1, '19:00', '21:00')", ids[name])
    await conn.execute("UPDATE mentor_profiles SET status = 'PAUSED' WHERE user_id = $1::uuid", ids["paused"])
    await conn.execute("UPDATE mentor_profiles SET status = 'SUSPENDED' WHERE user_id = $1::uuid", ids["suspended"])
    await conn.execute("UPDATE mentor_profiles SET status = 'ON_LEAVE', on_leave_until = current_date + 3 "
                       "WHERE user_id = $1::uuid", ids["on_leave"])
    # Nghỉ phép đã hết hạn (job chưa kịp chạy) vẫn phải được tính là ACCEPTING.
    await conn.execute("UPDATE mentor_profiles SET status = 'ON_LEAVE', on_leave_until = current_date - 3 "
                       "WHERE user_id = $1::uuid", ids["leave_expired"])
    # Cột tương thích is_available là cột sinh tự động từ status.
    assert await conn.fetchval("SELECT is_available FROM mentor_profiles WHERE user_id = $1::uuid", ids["paused"]) is False
    mentee_id = await _add_mentee(conn)
    await index_service.reconcile(batch=100)

    result = await matching_pipeline.match_mentors_for_mentee(mentee_id, limit=10)
    returned = {str(m["mentor_id"]) for m in result["mentors"]}
    assert returned == {ids["accepting"], ids["leave_expired"]}
    assert result["stats"]["excluded"] == {"unavailable": 3}


async def test_profile_pool_is_read_only(dbs):
    """Ngoại lệ kiến trúc (CONVENTIONS.md mục 7): role matching_reader chỉ được SELECT."""
    pool = await db.get_profile_pool()
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await pool.execute("DELETE FROM mentor_profiles")
