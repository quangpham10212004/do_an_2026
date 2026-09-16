import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from tests.helpers import make_pdf

H = {"X-Internal-Token": config.INTERNAL_API_KEY}


@pytest.fixture
def client():
    return TestClient(app)


def test_health_reports_rule_based_without_key(client):
    body = client.get("/health").json()
    assert body["status"] == "UP" and body["llmEnabled"] is False


def test_internal_token_required(client):
    res = client.post("/internal/interview/first-question", json={"context": {"domain": "backend"}})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_interview_round_trip_camel_case(client):
    ctx = {"domain": "backend", "skills": ["Java", "Redis"], "yearsExperience": 5, "maxTurns": 5}
    q = client.post("/internal/interview/first-question", json={"context": ctx}, headers=H).json()
    assert q["strategy"] == "OPENING" and q["engine"] == "RULE_BASED" and q["fallbackUsed"] is False

    current = {"turnNo": 1, "topic": q["topic"], "strategy": "OPENING", "question": q["question"], "answer": "Không biết"}
    ev = client.post("/internal/interview/evaluate",
                     json={"context": ctx, "history": [], "current": current, "isLastTurn": False, "engine": "RULE_BASED"},
                     headers=H).json()
    assert ev["next"]["strategy"] == "PIVOT" and "score" in ev

    summary = client.post("/internal/interview/summarize",
                          json={"context": ctx, "turns": [{**current, "score": ev["score"]}]}, headers=H).json()
    assert summary["recommendation"] == "REJECT" and "overallScore" in summary


def test_requesting_deepseek_without_key_uses_rule_based(client):
    res = client.post("/internal/interview/first-question", json={"context": {"domain": "backend"}, "engine": "DEEPSEEK"},
                      headers=H).json()
    assert res["engine"] == "RULE_BASED"


def test_cv_parse_multipart(client):
    pdf = make_pdf(["Backend Developer", "PROJECTS", "Booking system", "- Java, Spring Boot, Redis", "SKILLS", "Java, Docker"])
    res = client.post("/internal/cv/parse", files={"file": ("cv.pdf", pdf, "application/pdf")}, headers=H)
    body = res.json()
    assert res.status_code == 200
    assert body["parsed"]["currentRole"] == "Backend Developer"
    assert "Java" in body["parsed"]["skills"] and body["rawText"]


def test_cv_parse_errors_use_common_format(client):
    res = client.post("/internal/cv/parse", files={"file": ("cv.txt", b"not a pdf", "text/plain")}, headers=H)
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_enrichment_endpoints(client):
    ctx = {"domain": "backend", "currentLevel": "BEGINNER", "currentGoal": "Học backend", "maxTurns": 4,
           "cv": {"skills": ["Java"], "yearsExperience": 1, "projects": [], "education": []}}
    q = client.post("/internal/enrichment/next-question", json={"context": ctx, "history": []}, headers=H).json()
    assert q["slot"] == "TARGET_ROLE" and q["slotLabel"] == "Mục tiêu nghề nghiệp"
    history = [{"turnNo": 1, "slot": "TARGET_ROLE", "question": q["question"], "answer": "Backend Java"}]
    goal = client.post("/internal/enrichment/summarize", json={"context": ctx, "history": history}, headers=H).json()
    assert goal["enrichedGoal"].startswith("Mục tiêu: Backend Java")


def test_validation_error_format(client):
    res = client.post("/internal/enrichment/next-question", json={"context": {}}, headers=H)
    assert res.status_code == 400 and res.json()["error"]["code"] == "VALIDATION_ERROR"
