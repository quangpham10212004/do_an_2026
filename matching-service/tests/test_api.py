import time
from datetime import datetime, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import index_service, match_filters, matching_pipeline

MENTEE_ID = "7d4f5a3e-8a8f-4a57-9a0e-2a1d9d1f0c11"
OTHER_ID = "1b2c3d4e-0000-4000-8000-000000000001"
INDEXED_AT = datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc)


def token(sub: str, role: str, typ: str = "access") -> str:
    payload = {"sub": sub, "role": role, "typ": typ, "exp": int(time.time()) + 600}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def fake_pipeline(monkeypatch):
    calls = []

    async def fake_match(mentee_id: str, limit: int = 10, requested=None, use_profile_defaults=True, exclude_ids=None):
        calls.append({"limit": limit, "requested": requested, "use_profile_defaults": use_profile_defaults})
        if mentee_id == OTHER_ID:
            return None
        filters = match_filters.resolve(requested or {}, {"budget_max_per_hour": 150000}, use_profile_defaults)
        return {
            "mentors": [{
                "mentor_id": "mentor-1", "display_name": "Anh Mentor", "domain": "backend",
                "skills": ["Java"], "similarity_score": 0.8, "final_score": 0.82, "rating": 4.0,
                "rating_count": 2, "years_experience": 6, "hourly_rate": 200000,
                "matched_skills": ["Java"], "reasons": ["Trùng kỹ năng: Java"],
            }],
            "filters": filters,
            "excluded_by": {name: 12 for name in sorted(filters.active())},
            "stats": {"considered": 20, "excluded": {"notVerified": 4}, "eligible": 3, "k": 50,
                      "retrieved": 3, "returned": 1},
        }

    monkeypatch.setattr(matching_pipeline, "match_mentors_for_mentee", fake_match)
    return calls


def test_health(client):
    assert client.get("/health").json()["status"] == "UP"


def test_matching_requires_authentication(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_matching_rejects_refresh_or_forged_tokens(client, fake_pipeline):
    forged = jwt.encode({"sub": MENTEE_ID, "role": "MENTEE", "typ": "access"}, "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256")
    for t in (forged, token(MENTEE_ID, "MENTEE", typ="refresh")):
        res = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}", headers={"Authorization": f"Bearer {t}"})
        assert res.status_code == 401


def test_mentee_cannot_query_other_mentee(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={OTHER_ID}",
                     headers={"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"})
    assert res.status_code == 403


def test_matching_returns_camel_case_contract(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}&limit=5",
                     headers={"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"})
    assert res.status_code == 200
    body = res.json()
    assert body["menteeId"] == MENTEE_ID
    m = body["mentors"][0]
    assert {"mentorId", "displayName", "similarityScore", "finalScore", "yearsExperience", "reasons", "matchedSkills"} <= m.keys()
    assert body["pipeline"]["excluded"] == {"notVerified": 4}
    assert body["pipeline"]["weights"]["similarity"] == 0.7


def test_matching_echoes_effective_filters_and_excluded_by(client, fake_pipeline):
    """US-17/18 — thiếu param thì lấy sở thích hồ sơ; response trả lại bộ lọc hiệu lực + excludedBy."""
    headers = {"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"}
    body = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}", headers=headers).json()
    assert body["filters"]["maxRate"] == 150000
    assert body["filters"]["fromProfileDefaults"] == ["maxRate"]
    assert body["excludedBy"] == {"maxRate": 12}
    assert body["pipeline"]["eligible"] == 3 and body["pipeline"]["considered"] == 20

    url = (f"/api/matching/mentors?menteeId={MENTEE_ID}&maxRate=500000&days=1,3&days=5&timeOfDay=EVENING"
           f"&language=en&sessionType=CODE_REVIEW&minRating=4&freeOnly=true&useProfileDefaults=false&limit=5")
    body = client.get(url, headers=headers).json()
    assert fake_pipeline[-1] == {
        "limit": 5,
        "use_profile_defaults": False,
        "requested": {"maxRate": 500000, "days": [1, 3, 5], "timeOfDay": "EVENING", "language": ["en"],
                      "sessionType": "CODE_REVIEW", "minRating": 4, "freeOnly": True},
    }
    assert body["filters"] == {"maxRate": 500000, "days": [1, 3, 5], "timeOfDay": "EVENING", "language": ["en"],
                               "sessionType": "CODE_REVIEW", "minRating": 4, "freeOnly": True,
                               "fromProfileDefaults": []}


def test_matching_without_filter_params_passes_none(client, fake_pipeline):
    client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}",
               headers={"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"})
    assert fake_pipeline[-1]["use_profile_defaults"] is True
    assert set(fake_pipeline[-1]["requested"].values()) == {None}


def test_matching_rejects_invalid_filter_values(client, fake_pipeline):
    headers = {"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"}
    for query in ("days=0", "days=8", "days=abc", "timeOfDay=NIGHT", "language=fr", "sessionType=PAIRING",
                  "minRating=6", "maxRate=-1"):
        res = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}&{query}", headers=headers)
        assert res.status_code == 400, query
        assert res.json()["error"]["code"] in ("BAD_REQUEST", "VALIDATION_ERROR"), query


def test_matching_404_when_profile_incomplete(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={OTHER_ID}",
                     headers={"Authorization": f"Bearer {token(OTHER_ID, 'MENTEE')}"})
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "MENTEE_PROFILE_INCOMPLETE"


def test_admin_can_query_any_mentee(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}",
                     headers={"Authorization": f"Bearer {token(OTHER_ID, 'ADMIN')}"})
    assert res.status_code == 200


@pytest.fixture
def fake_index(monkeypatch):
    """Thay các hàm chạm DB của index_service — router test không cần database thật."""
    calls = []

    async def fake_reindex(user_id, role=None, force=False):
        calls.append((user_id, role, force))
        if user_id == OTHER_ID:
            return index_service.IndexResult(user_id, None, index_service.NOT_FOUND)
        return index_service.IndexResult(user_id, role or "MENTEE", index_service.UPDATED, INDEXED_AT)

    async def fake_status(user_id, role=None):
        return index_service.IndexResult(user_id, "MENTEE", index_service.UPDATED, INDEXED_AT)

    async def fake_rebuild(force):
        return {"mentors": 3, "mentees": 2, "pending": 0}

    monkeypatch.setattr(index_service, "reindex", fake_reindex)
    monkeypatch.setattr(index_service, "status", fake_status)
    monkeypatch.setattr(index_service, "rebuild_all", fake_rebuild)
    return calls


def test_reindex_requires_internal_token(client, fake_index):
    assert client.post("/internal/embeddings/reindex", json={"userId": MENTEE_ID}).status_code == 403
    res = client.post("/internal/embeddings/reindex", json={"userId": MENTEE_ID, "role": "MENTEE"},
                      headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert res.status_code == 200
    assert res.json()["status"] == "UPDATED"
    assert res.json()["userId"] == MENTEE_ID
    assert fake_index == [(MENTEE_ID, "MENTEE", False)]


def test_reindex_rejects_malformed_user_id(client, fake_index):
    res = client.post("/internal/embeddings/reindex", json={"userId": "not-a-uuid"},
                      headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "BAD_REQUEST"


def test_reindex_404_when_profile_missing(client, fake_index):
    res = client.post("/internal/embeddings/reindex", json={"userId": OTHER_ID},
                      headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PROFILE_NOT_FOUND"


def test_index_status_is_restricted_to_owner_or_admin(client, fake_index):
    assert client.get(f"/api/matching/index-status?userId={MENTEE_ID}").status_code == 401
    res = client.get(f"/api/matching/index-status?userId={OTHER_ID}",
                     headers={"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"})
    assert res.status_code == 403
    res = client.get(f"/api/matching/index-status?userId={MENTEE_ID}",
                     headers={"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"})
    assert res.status_code == 200
    assert res.json()["status"] == "UPDATED"
    assert res.json()["indexedAt"].startswith("2026-09-21")
    res = client.get(f"/api/matching/index-status?userId={MENTEE_ID}",
                     headers={"Authorization": f"Bearer {token(OTHER_ID, 'ADMIN')}"})
    assert res.status_code == 200


def test_rebuild_is_admin_only(client, fake_index):
    url = "/api/matching/admin/embeddings/rebuild?force=true"
    assert client.post(url, headers={"Authorization": f"Bearer {token(MENTEE_ID, 'MENTEE')}"}).status_code == 403
    res = client.post(url, headers={"Authorization": f"Bearer {token(OTHER_ID, 'ADMIN')}"})
    assert res.status_code == 200
    assert res.json() == {"mentors": 3, "mentees": 2, "pending": 0}


def test_dev_secret_fallbacks_are_flagged(monkeypatch):
    """B.11 — khởi động với khoá dev mặc định phải log WARNING; đặt khoá thật thì im lặng."""
    monkeypatch.setattr(config, "JWT_SECRET", config._DEV_JWT_SECRET)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", config._DEV_INTERNAL_API_KEY)
    assert len(config.dev_secret_warnings()) == 2
    monkeypatch.setattr(config, "JWT_SECRET", "x" * 64)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", "khoa-noi-bo-that")
    assert config.dev_secret_warnings() == []


def test_prod_mode_rejects_dev_secrets(monkeypatch):
    """NFR-9 — APP_ENV=prod: khởi động thất bại nếu còn khoá dev mặc định."""
    monkeypatch.setattr(config, "APP_ENV", "prod")
    monkeypatch.setattr(config, "JWT_SECRET", config._DEV_JWT_SECRET)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", "khoa-noi-bo-that")
    assert config.prod_secret_errors() == ["JWT_SECRET"]
    with pytest.raises(RuntimeError, match="NFR-9"):
        with TestClient(app):
            pass
    monkeypatch.setattr(config, "JWT_SECRET", "x" * 64)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", config._DEV_INTERNAL_API_KEY)
    assert config.prod_secret_errors() == ["INTERNAL_API_KEY"]
    monkeypatch.setattr(config, "INTERNAL_API_KEY", "khoa-noi-bo-that")
    assert config.prod_secret_errors() == []
    # Ngoài prod chỉ cảnh báo, không chặn.
    monkeypatch.setattr(config, "APP_ENV", "dev")
    monkeypatch.setattr(config, "JWT_SECRET", config._DEV_JWT_SECRET)
    assert config.prod_secret_errors() == []
