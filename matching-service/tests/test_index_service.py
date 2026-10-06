"""
Chỉ mục embedding — logic trước đây nằm ở profile-service (EmbeddingService.java).
Test chạy không cần database: các hàm chạm DB được thay bằng bản giả.
"""
import pytest

from app.services import index_service
from app.services.profile_text import MENTEE, MENTOR, normalize_mentee, normalize_mentor, text_hash

MENTOR_ROW = {
    "user_id": "7d4f5a3e-8a8f-4a57-9a0e-2a1d9d1f0c11",
    "domain": "backend",
    "skills": ["Java", " Spring  Boot "],
    "years_experience": 7,
    "bio": "Kỹ sư backend\n tại công ty X",
}
MENTEE_ROW = {
    "user_id": "1b2c3d4e-0000-4000-8000-000000000001",
    "domain": "backend",
    "skills": ["Java"],
    "current_level": "BEGINNER",
    "goal": "Học system design",
}


def test_mentor_and_mentee_text_share_the_same_structure():
    assert normalize_mentor(MENTOR_ROW) == (
        "Domain: backend. Skills: Java, Spring Boot. Experience: 7 years. About: Kỹ sư backend tại công ty X"
    )
    assert normalize_mentee(MENTEE_ROW) == "Domain: backend. Skills: Java. Level: beginner. Goal: Học system design"


def test_text_hash_only_changes_when_text_changes():
    assert text_hash("a") == text_hash("a")
    assert text_hash("a") != text_hash("b")


def test_vector_is_serialized_in_pgvector_literal_format():
    assert index_service._to_pgvector([0.5, -1.0, 0.25]) == "[0.5,-1.0,0.25]"


@pytest.fixture
def fake_store(monkeypatch):
    """Ghi lại lời gọi DB/model thay vì chạm DB thật."""
    state = {"index_row": None, "stored": [], "pending": [], "embed_calls": []}

    async def fetch_profile(role, user_id):
        return MENTOR_ROW if role == MENTOR else MENTEE_ROW

    async def fetch_index_row(role, user_id):
        return state["index_row"]

    async def store_vector(role, user_id, vector, hash_):
        state["stored"].append((role, user_id, vector, hash_))
        return "2026-09-21T10:00:00+00:00"

    async def mark_pending(role, user_id, error):
        state["pending"].append((role, user_id, error))

    def embed(text):
        state["embed_calls"].append(text)
        return [0.1, 0.2]

    monkeypatch.setattr(index_service, "_fetch_profile", fetch_profile)
    monkeypatch.setattr(index_service, "_fetch_index_row", fetch_index_row)
    monkeypatch.setattr(index_service, "_store_vector", store_vector)
    monkeypatch.setattr(index_service, "_mark_pending", mark_pending)
    monkeypatch.setattr(index_service, "embed_text", embed)
    return state


@pytest.mark.anyio
async def test_embedding_is_skipped_when_text_unchanged(fake_store):
    """NFR-7 — text không đổi thì không chạy model lại."""
    fake_store["index_row"] = {"has_vector": True, "text_hash": text_hash(normalize_mentor(MENTOR_ROW)),
                               "indexed_at": "2026-09-01T00:00:00+00:00"}
    result = await index_service.reindex(MENTOR_ROW["user_id"], role=MENTOR)
    assert result.status == index_service.UNCHANGED
    assert fake_store["embed_calls"] == []
    assert fake_store["stored"] == []


@pytest.mark.anyio
async def test_force_reembeds_even_when_hash_matches(fake_store):
    fake_store["index_row"] = {"has_vector": True, "text_hash": text_hash(normalize_mentor(MENTOR_ROW)),
                               "indexed_at": None}
    result = await index_service.reindex(MENTOR_ROW["user_id"], role=MENTOR, force=True)
    assert result.status == index_service.UPDATED
    assert len(fake_store["stored"]) == 1


@pytest.mark.anyio
async def test_successful_embedding_stores_vector_and_hash(fake_store):
    fake_store["index_row"] = None
    result = await index_service.reindex(MENTEE_ROW["user_id"], role=MENTEE)
    assert result.status == index_service.UPDATED
    role, user_id, vector, hash_ = fake_store["stored"][0]
    assert role == MENTEE
    assert vector == [0.1, 0.2]
    assert hash_ == text_hash(normalize_mentee(MENTEE_ROW))


@pytest.mark.anyio
async def test_stale_hash_triggers_reembedding(fake_store):
    fake_store["index_row"] = {"has_vector": True, "text_hash": "hash-cu", "indexed_at": None}
    result = await index_service.reindex(MENTOR_ROW["user_id"], role=MENTOR)
    assert result.status == index_service.UPDATED
    assert fake_store["embed_calls"] == [normalize_mentor(MENTOR_ROW)]


@pytest.mark.anyio
async def test_embedding_failure_marks_pending_and_keeps_old_vector(fake_store, monkeypatch):
    def boom(text):
        raise RuntimeError("model chưa sẵn sàng")

    monkeypatch.setattr(index_service, "embed_text", boom)
    fake_store["index_row"] = None
    result = await index_service.reindex(MENTEE_ROW["user_id"], role=MENTEE)
    assert result.status == index_service.PENDING
    assert fake_store["stored"] == []
    assert fake_store["pending"][0][0] == MENTEE


@pytest.mark.anyio
async def test_status_is_pending_when_profile_text_drifted(fake_store):
    fake_store["index_row"] = {"has_vector": True, "text_hash": "hash-cu", "indexed_at": None}
    assert (await index_service.status(MENTOR_ROW["user_id"], role=MENTOR)).status == index_service.PENDING
    fake_store["index_row"] = {"has_vector": True, "text_hash": text_hash(normalize_mentor(MENTOR_ROW)),
                               "indexed_at": "2026-09-21T10:00:00+00:00"}
    assert (await index_service.status(MENTOR_ROW["user_id"], role=MENTOR)).status == index_service.UPDATED


# ---------------- IndexSyncJob (reconcile) ----------------


def _mentor(user_id, domain="backend", bio="x"):
    return {"user_id": user_id, "domain": domain, "skills": ["Java"], "years_experience": 3, "bio": bio}


@pytest.fixture
def fake_reconcile(monkeypatch):
    """Giả lập profile_db + chỉ mục để chạy reconcile() không cần database."""
    state = {"profiles": {MENTOR: [], MENTEE: []}, "indexed": {MENTOR: {}, MENTEE: {}},
             "reindexed": [], "pruned": {}, "fail": set()}

    async def fetch_all(role):
        return state["profiles"][role]

    async def prune(role, live_ids):
        state["pruned"][role] = sorted(live_ids)
        return 0

    class FakePool:
        async def fetch(self, sql, *args):
            role = MENTOR if "mentor_embeddings" in sql else MENTEE
            return [{"user_id": uid, "text_hash": h} for uid, h in state["indexed"][role].items()]

    async def get_pool():
        return FakePool()

    async def index(role, profile, force):
        state["reindexed"].append((role, profile["user_id"]))
        status = index_service.PENDING if profile["user_id"] in state["fail"] else index_service.UPDATED
        return index_service.IndexResult(profile["user_id"], role, status)

    monkeypatch.setattr(index_service, "_fetch_all_profiles", fetch_all)
    monkeypatch.setattr(index_service, "_prune", prune)
    monkeypatch.setattr(index_service, "get_matching_pool", get_pool)
    monkeypatch.setattr(index_service, "_index", index)
    return state


@pytest.mark.anyio
async def test_reconcile_only_reembeds_profiles_whose_text_drifted(fake_reconcile):
    fresh, stale, missing = _mentor("a"), _mentor("b", bio="bio đã sửa"), _mentor("c")
    fake_reconcile["profiles"][MENTOR] = [fresh, stale, missing]
    fake_reconcile["indexed"][MENTOR] = {
        "a": text_hash(normalize_mentor(fresh)),
        "b": "hash-cu",
        # "c" chưa từng được lập chỉ mục
    }
    stats = await index_service.reconcile(batch=100)
    assert sorted(uid for _, uid in fake_reconcile["reindexed"]) == ["b", "c"]
    assert stats["stale"] == 2
    assert stats["reindexed"] == 2
    assert stats["pending"] == 0


@pytest.mark.anyio
async def test_reconcile_respects_batch_size(fake_reconcile):
    fake_reconcile["profiles"][MENTOR] = [_mentor(str(i)) for i in range(10)]
    stats = await index_service.reconcile(batch=3)
    assert stats["stale"] == 10       # đếm đủ số hồ sơ lệch...
    assert stats["reindexed"] == 3    # ...nhưng chỉ embed 3 hồ sơ mỗi vòng


@pytest.mark.anyio
async def test_reconcile_counts_failures_as_pending(fake_reconcile):
    fake_reconcile["profiles"][MENTOR] = [_mentor("a"), _mentor("b")]
    fake_reconcile["fail"] = {"b"}
    stats = await index_service.reconcile(batch=100)
    assert stats["reindexed"] == 1 and stats["pending"] == 1


@pytest.mark.anyio
async def test_reconcile_prunes_against_live_profiles(fake_reconcile):
    fake_reconcile["profiles"][MENTOR] = [_mentor("a")]
    await index_service.reconcile(batch=100)
    assert fake_reconcile["pruned"][MENTOR] == ["a"]
    assert fake_reconcile["pruned"][MENTEE] == []
