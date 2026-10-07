"""
US-17 / US-18 — pipeline AI Matching có bộ lọc, chạy trên PostgreSQL THẬT (schema dựng từ chính các
migration của repo, giống test_index_db.py): SQL hard filter trên profile_db qua role matching_reader,
xếp hạng pgvector trong matching_db.

Cần MATCHING_DB_URL, PROFILE_DB_URL (role matching_reader), PROFILE_DB_ADMIN_URL trỏ tới DB DÙNG MỘT
LẦN. Thiếu biến => skip khi local, FAIL trên CI.
"""
import os
import uuid

import asyncpg
import pytest

from app import db
from app.services import index_service, matching_pipeline
from app.services.embedding_service import EMBEDDING_DIM
from tests.schema import migrate_matching_db, reset_profile_db

_REQUIRED = ("MATCHING_DB_URL", "PROFILE_DB_URL", "PROFILE_DB_ADMIN_URL")
_MISSING = [name for name in _REQUIRED if not os.getenv(name)]
if _MISSING:
    if os.getenv("CI"):
        raise RuntimeError(f"CI phải cấp CSDL cho test matching, thiếu: {', '.join(_MISSING)}")
    pytest.skip(f"cần CSDL thật, thiếu biến: {', '.join(_MISSING)}", allow_module_level=True)

pytestmark = pytest.mark.anyio


def _axis(i: int) -> list[float]:
    v = [0.0] * EMBEDDING_DIM
    v[i] = 1.0
    return v


def _embed(text: str) -> list[float]:
    """Vector giả điều khiển được: hồ sơ nhắc tới Kafka nằm sát mentee (mục tiêu Kafka), còn lại vuông góc."""
    return _axis(0) if "Kafka" in text else _axis(1)


@pytest.fixture
async def conn(monkeypatch):
    monkeypatch.setattr(index_service, "embed_text", _embed)
    admin = await asyncpg.connect(os.environ["PROFILE_DB_ADMIN_URL"])
    matching = await asyncpg.connect(os.environ["MATCHING_DB_URL"])
    await reset_profile_db(admin)
    await migrate_matching_db(matching)
    await matching.execute("TRUNCATE mentor_embeddings, mentee_embeddings")
    try:
        yield admin
    finally:
        await admin.close()
        await matching.close()
        await db.close_pools()


async def add_mentor(conn, *, rate=0, slots=((1, "19:00", "21:00"),), bio="Kỹ sư Docker", domain="backend",
                     languages=("vi",), session_types=None, rating=0.0, rating_count=0, verification="APPROVED",
                     status="ACCEPTING", capacity=3, active=0, years=5) -> str:
    user_id = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO mentor_profiles (user_id, display_name, skills, domain, bio, years_experience, hourly_rate, "
        "capacity, active_mentee_count, rating, rating_count, verification_status, status, languages) "
        "VALUES ($1::uuid, $2, '{Java}', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        user_id, f"Mentor {user_id[:4]}", domain, bio, years, rate, capacity, active, rating, rating_count,
        verification, status, list(languages),
    )
    if session_types is not None:
        await conn.execute("UPDATE mentor_profiles SET session_types = $2 WHERE user_id = $1::uuid",
                           user_id, list(session_types))
    for day, start, end in slots:
        await conn.execute(
            "INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time) "
            "VALUES ($1::uuid, $2, $3::time, $4::time)",
            user_id, day, _t(start), _t(end))
    return user_id


def _t(value: str):
    from datetime import time
    h, m = value.split(":")
    return time(int(h), int(m))


async def add_mentee(conn, **prefs) -> str:
    user_id = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO mentee_profiles (user_id, display_name, domain, skills, goal) "
        "VALUES ($1::uuid, 'Mentee', 'backend', '{Java}', 'Muốn học Kafka')", user_id)
    if prefs:
        await conn.execute(
            "UPDATE mentee_profiles SET preferred_days = $2, preferred_time_of_day = $3, "
            "budget_max_per_hour = $4, languages = $5 WHERE user_id = $1::uuid",
            user_id, prefs.get("days", []), prefs.get("time_of_day"), prefs.get("budget"), prefs.get("languages", []))
    return user_id


async def match(mentee_id, limit=10, use_profile_defaults=True, **requested):
    await index_service.reconcile(batch=500)
    return await matching_pipeline.match_mentors_for_mentee(
        mentee_id, limit=limit, requested=requested, use_profile_defaults=use_profile_defaults)


def ids(result) -> set[str]:
    return {str(m["mentor_id"]) for m in result["mentors"]}


async def test_filters_apply_before_vector_ranking(conn):
    """
    AC US-17: maxRate=150000 => không kết quả nào có hourlyRate > 150.000; 30 mentor hợp lệ, limit=10 =>
    đúng 10 kết quả. 60 mentor đắt nằm SÁT mentee hơn trong không gian vector: nếu lọc sau top-K (K=50)
    như trước thì sẽ hụt sạch kết quả.
    """
    expensive = [await add_mentor(conn, rate=500000, bio="Chuyên gia Kafka") for _ in range(60)]
    cheap = [await add_mentor(conn, rate=100000 if i % 2 else 150000) for i in range(30)]
    mentee = await add_mentee(conn)

    unfiltered = await match(mentee)
    assert ids(unfiltered) <= set(expensive) and len(unfiltered["mentors"]) == 10

    result = await match(mentee, maxRate=150000)
    assert len(result["mentors"]) == 10
    assert all(float(m["hourly_rate"]) <= 150000 for m in result["mentors"])
    assert ids(result) <= set(cheap)
    assert result["excluded_by"] == {"maxRate": 60}
    assert result["stats"]["eligible"] == 30 and result["stats"]["considered"] == 90
    assert result["stats"]["retrieved"] == 30 and result["stats"]["returned"] == 10

    # freeOnly: không mentor nào miễn phí => rỗng, excludedBy chỉ ra đúng thủ phạm.
    result = await match(mentee, freeOnly=True)
    assert result["mentors"] == [] and result["excluded_by"] == {"freeOnly": 90}


async def test_system_constraints_are_counted_over_all_mentors(conn):
    ok = await add_mentor(conn)
    await add_mentor(conn, verification="PENDING_REVIEW")
    await add_mentor(conn, verification="REJECTED")
    await add_mentor(conn, status="PAUSED")
    await add_mentor(conn, slots=())
    await add_mentor(conn, capacity=2, active=2)
    await add_mentor(conn, domain="Frontend")
    await add_mentor(conn, domain=" BACKEND ")  # so lĩnh vực không phân biệt hoa thường/khoảng trắng
    mentee = await add_mentee(conn)

    result = await match(mentee)
    assert ok in ids(result) and len(result["mentors"]) == 2
    assert result["stats"]["excluded"] == {"notVerified": 2, "unavailable": 1, "noSchedule": 1,
                                           "fullCapacity": 1, "domainMismatch": 1}
    assert result["excluded_by"] == {}


async def test_days_and_time_of_day_windows(conn):
    monday_evening = await add_mentor(conn, slots=((1, "19:00", "21:00"),))
    saturday_morning = await add_mentor(conn, slots=((6, "08:00", "10:00"),))
    split = await add_mentor(conn, slots=((1, "08:00", "10:00"), (6, "19:00", "21:00")))
    ends_at_six = await add_mentor(conn, slots=((1, "16:00", "18:00"),))      # chạm 18:00, không giao buổi tối
    late = await add_mentor(conn, slots=((3, "22:30", "23:30"),))             # giao buổi tối 22:30–23:00
    mentee = await add_mentee(conn)

    result = await match(mentee, timeOfDay="EVENING")
    assert ids(result) == {monday_evening, split, late}

    result = await match(mentee, days=[1])
    assert ids(result) == {monday_evening, split, ends_at_six}

    result = await match(mentee, days=[1], timeOfDay="EVENING")
    assert ids(result) == {monday_evening}
    # split: bỏ ngày thì khớp (tối T7), bỏ buổi cũng khớp (sáng T2); late chỉ khớp khi bỏ ngày;
    # ends_at_six chỉ khớp khi bỏ buổi.
    assert result["excluded_by"] == {"days": 2, "timeOfDay": 2}

    result = await match(mentee, days=[6, 7], timeOfDay="MORNING")
    assert ids(result) == {saturday_morning}


async def test_language_session_type_and_rating(conn):
    en = await add_mentor(conn, languages=("vi", "en"), rating=4.5, rating_count=10)
    vi = await add_mentor(conn, languages=("vi",), session_types=("CODE_REVIEW",), rating=3.9, rating_count=3)
    new = await add_mentor(conn, languages=("en",), session_types=("MOCK_INTERVIEW",))
    mentee = await add_mentee(conn)

    assert ids(await match(mentee, language=["en"])) == {en, new}
    assert ids(await match(mentee, sessionType="CODE_REVIEW")) == {en, vi}
    result = await match(mentee, minRating=4)
    assert ids(result) == {en}  # mentor chưa có đánh giá (rating 0) không qua minRating
    assert result["excluded_by"] == {"minRating": 2}
    result = await match(mentee, language=["en"], sessionType="CODE_REVIEW")
    assert ids(result) == {en}
    assert result["excluded_by"] == {"language": 1, "sessionType": 1}


async def test_profile_preferences_are_defaults_and_can_be_overridden(conn):
    cheap_en = await add_mentor(conn, rate=100000, languages=("en",))
    cheap_vi = await add_mentor(conn, rate=100000)
    pricey_en = await add_mentor(conn, rate=300000, languages=("en",))
    mentee = await add_mentee(conn, budget=150000, languages=["en"])

    result = await match(mentee)  # đọc cột sở thích bằng role matching_reader
    assert ids(result) == {cheap_en}
    assert set(result["filters"].from_profile_defaults) == {"maxRate", "language"}
    assert result["excluded_by"] == {"maxRate": 1, "language": 1}

    result = await match(mentee, maxRate=500000)  # ghi đè cho lượt này, không lưu
    assert ids(result) == {cheap_en, pricey_en}
    assert result["filters"].from_profile_defaults == ("language",)

    result = await match(mentee, use_profile_defaults=False)
    assert ids(result) == {cheap_en, cheap_vi, pricey_en}
    assert result["filters"].active() == set()
    assert await conn.fetchval("SELECT budget_max_per_hour FROM mentee_profiles WHERE user_id = $1::uuid",
                               mentee) == 150000


async def test_similar_mentors_applies_preferences_then_relaxes(conn):
    """Interface US-15 (mentoring-service): loại mentor đã cho, áp sở thích, nới nếu chưa đủ limit."""
    best = await add_mentor(conn, rate=100000, bio="Chuyên gia Kafka", years=9)
    cheap = await add_mentor(conn, rate=100000)
    declined = await add_mentor(conn, rate=100000, bio="Chuyên gia Kafka")
    pricey = await add_mentor(conn, rate=300000)
    await add_mentor(conn, rate=100000, domain="frontend")          # ràng buộc hệ thống: không bao giờ
    await add_mentor(conn, rate=100000, verification="PENDING_REVIEW")
    mentee = await add_mentee(conn, budget=150000)
    await index_service.reconcile(batch=500)

    result = await matching_pipeline.similar_mentors(mentee, declined, limit=3)
    assert [str(m["mentor_id"]) for m in result] == [best, cheap, pricey]  # vòng sở thích trước, phần nới sau
    assert all(m["final_score"] > 0 for m in result)

    result = await matching_pipeline.similar_mentors(mentee, declined, limit=1)
    assert [str(m["mentor_id"]) for m in result] == [best]

    result = await matching_pipeline.similar_mentors(mentee, best, limit=10)
    assert {str(m["mentor_id"]) for m in result} == {cheap, declined, pricey}

    assert await matching_pipeline.similar_mentors(str(uuid.uuid4()), best, limit=3) == []
