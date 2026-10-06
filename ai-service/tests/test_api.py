"""API công khai của ai-service: xác thực, phân quyền, định dạng lỗi chung."""
import uuid

import pytest

from app import config
from tests.conftest import auth
from tests.helpers import make_pdf

MENTEE = uuid.uuid4()


def test_health_reports_rule_based_without_key(client):
    body = client.get("/health").json()
    assert body["service"] == "ai-service" and body["llmEnabled"] is False


def test_jwt_required(client):
    res = client.get("/api/ai/interviews/me")
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHORIZED"


def test_invalid_token_is_rejected(client):
    res = client.get("/api/ai/interviews/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


@pytest.mark.parametrize("path,role", [
    ("/api/ai/interviews/me", "MENTEE"),
    ("/api/ai/admin/interviews", "MENTOR"),
    ("/api/ai/admin/stats", "MENTEE"),
])
def test_role_is_enforced(client, path, role):
    res = client.get(path, headers=auth(uuid.uuid4(), role))
    assert res.status_code == 403 and res.json()["error"]["code"] == "FORBIDDEN"


def test_cv_parse_returns_structured_data(client, db, fake_profile):
    pdf = make_pdf(["Backend Developer", "PROJECTS", "Booking system", "- Java, Spring Boot, Redis",
                    "SKILLS", "Java, Docker"])
    res = client.post("/api/ai/cv/parse", files={"file": ("cv.pdf", pdf, "application/pdf")},
                      headers=auth(MENTEE, "MENTOR"))
    body = res.json()
    assert res.status_code == 200, res.text
    assert body["engine"] == "RULE_BASED"
    assert body["parsed"]["currentRole"] == "Backend Developer"
    assert "Java" in body["parsed"]["skills"]


def test_cv_parse_errors_use_common_format(client, db):
    res = client.post("/api/ai/cv/parse", files={"file": ("cv.txt", b"not a pdf", "text/plain")},
                      headers=auth(MENTEE, "MENTOR"))
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_validation_error_format(client, db, fake_profile):
    interview = uuid.uuid4()
    res = client.post(f"/api/ai/interviews/{interview}/answers", json={"answer": ""},
                      headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 400 and res.json()["error"]["code"] == "VALIDATION_ERROR"


def test_not_found_uses_common_format(client, db, fake_profile):
    res = client.get(f"/api/ai/interviews/{uuid.uuid4()}", headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 404 and res.json()["error"]["code"] == "INTERVIEW_NOT_FOUND"


def test_dev_secret_fallbacks_are_flagged(monkeypatch):
    """B.11 — khởi động với khoá dev mặc định phải log WARNING; đặt khoá thật thì im lặng."""
    monkeypatch.setattr(config, "JWT_SECRET", config._DEV_JWT_SECRET)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", config._DEV_INTERNAL_API_KEY)
    assert len(config.dev_secret_warnings()) == 2
    monkeypatch.setattr(config, "JWT_SECRET", "x" * 64)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", "khoa-noi-bo-that")
    assert config.dev_secret_warnings() == []


@pytest.mark.parametrize("jwt_dev, key_dev, expected", [
    (True, False, "JWT_SECRET"), (False, True, "INTERNAL_API_KEY"), (True, True, "JWT_SECRET, INTERNAL_API_KEY")])
def test_prod_refuses_dev_secrets(monkeypatch, jwt_dev, key_dev, expected):
    """US-10 / NFR-9 — APP_ENV=prod với khoá dev mặc định thì không khởi động (kể cả qua lifespan)."""
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setattr(config, "JWT_SECRET", config._DEV_JWT_SECRET if jwt_dev else "x" * 64)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", config._DEV_INTERNAL_API_KEY if key_dev else "khoa-that")
    with pytest.raises(RuntimeError, match=expected):
        config.enforce_prod_secrets()
    from fastapi.testclient import TestClient
    from app.main import app
    with pytest.raises(RuntimeError):
        with TestClient(app):
            pass


def test_prod_with_real_secrets_and_dev_env_with_dev_secrets_start(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setattr(config, "JWT_SECRET", "x" * 64)
    monkeypatch.setattr(config, "INTERNAL_API_KEY", "khoa-that")
    config.enforce_prod_secrets()
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setattr(config, "JWT_SECRET", config._DEV_JWT_SECRET)
    config.enforce_prod_secrets()  # dev: chỉ cảnh báo
