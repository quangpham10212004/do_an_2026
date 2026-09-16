import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import matching_pipeline

MENTEE_ID = "7d4f5a3e-8a8f-4a57-9a0e-2a1d9d1f0c11"
OTHER_ID = "1b2c3d4e-0000-4000-8000-000000000001"


def token(sub: str, role: str, typ: str = "access") -> str:
    payload = {"sub": sub, "role": role, "typ": typ, "exp": int(time.time()) + 600}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def fake_pipeline(monkeypatch):
    async def fake_match(mentee_id: str, limit: int = 10):
        if mentee_id == OTHER_ID:
            return None
        return {
            "mentors": [{
                "mentor_id": "mentor-1", "display_name": "Anh Mentor", "domain": "backend",
                "skills": ["Java"], "similarity_score": 0.8, "final_score": 0.82, "rating": 4.0,
                "rating_count": 2, "years_experience": 6, "hourly_rate": 200000,
                "matched_skills": ["Java"], "reasons": ["Trùng kỹ năng: Java"],
            }],
            "stats": {"k": 50, "retrieved": 5, "excluded": {"notVerified": 4}, "returned": 1},
        }

    monkeypatch.setattr(matching_pipeline, "match_mentors_for_mentee", fake_match)


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


def test_matching_404_when_profile_incomplete(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={OTHER_ID}",
                     headers={"Authorization": f"Bearer {token(OTHER_ID, 'MENTEE')}"})
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "MENTEE_PROFILE_INCOMPLETE"


def test_admin_can_query_any_mentee(client, fake_pipeline):
    res = client.get(f"/api/matching/mentors?menteeId={MENTEE_ID}",
                     headers={"Authorization": f"Bearer {token(OTHER_ID, 'ADMIN')}"})
    assert res.status_code == 200


def test_embed_requires_internal_token(client, monkeypatch):
    from app.routers import embed as embed_router
    monkeypatch.setattr(embed_router, "embed_text", lambda text: [0.1] * 384)
    assert client.post("/internal/embed", json={"text": "java"}).status_code == 403
    res = client.post("/internal/embed", json={"text": "java"}, headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert res.status_code == 200
    assert len(res.json()["embedding"]) == 384


def test_embed_validates_empty_text(client):
    res = client.post("/internal/embed", json={"text": ""}, headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
