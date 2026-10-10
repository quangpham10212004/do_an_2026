"""US-46 — X-Request-Id, log JSON, GET /metrics (NFR-17) và giới hạn 5 CV / giờ / người dùng (NFR-10)."""
import json
import logging
import uuid

import httpx
import pytest

from app import observability
from app.ratelimit import RateLimiter
from tests.conftest import auth
from tests.test_cv_enrichment_flow import upload


def test_request_id_is_echoed_or_generated(client):
    assert client.get("/health", headers={"X-Request-Id": "e2e-abc_1"}).headers["X-Request-Id"] == "e2e-abc_1"
    generated = client.get("/health", headers={"X-Request-Id": "bad id\nwith newline"}).headers["X-Request-Id"]
    assert str(uuid.UUID(generated)) == generated


def test_metrics_counts_requests_by_route_template(client):
    client.get(f"/api/ai/cv/{uuid.uuid4()}/file")  # 401 — vẫn được đếm theo mẫu route
    res = client.get("/metrics")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/plain")
    assert "# TYPE http_requests_total counter" in res.text
    assert 'route="/api/ai/cv/{cv_id}/file",status="401"' in res.text
    assert "http_request_duration_seconds_count" in res.text


def test_json_formatter_includes_request_id():
    token = observability.request_id.set("rid-1")
    try:
        record = logging.LogRecord("app.x", logging.WARNING, __file__, 1, "xin chào %s", ("bạn",), None)
        line = json.loads(observability.JsonFormatter("ai-service").format(record))
    finally:
        observability.request_id.reset(token)
    assert line["message"] == "xin chào bạn" and line["requestId"] == "rid-1"
    assert line["service"] == "ai-service" and line["level"] == "WARNING" and line["@timestamp"]


@pytest.mark.anyio
async def test_outgoing_calls_carry_request_id():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["id"] = request.headers.get("X-Request-Id")
        return httpx.Response(204)

    token = observability.request_id.set("rid-2")
    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                     event_hooks={"request": [observability.propagate_request_id]}) as c:
            await c.get("http://profile/internal/x")
    finally:
        observability.request_id.reset(token)
    assert seen["id"] == "rid-2"


def test_rate_limiter_fixed_window():
    now = [100.0]
    limiter = RateLimiter(2, 60, clock=lambda: now[0])
    assert limiter.hit("a") == 0 and limiter.hit("a") == 0
    now[0] += 15
    assert limiter.hit("a") == 45
    assert limiter.hit("b") == 0
    now[0] += 46
    assert limiter.hit("a") == 0


def test_sixth_cv_upload_within_an_hour_is_429(client, db, fake_profile):
    mentee_id = uuid.uuid4()
    for _ in range(5):
        assert upload(client, mentee_id).status_code == 200
    res = upload(client, mentee_id)
    assert res.status_code == 429 and res.json()["error"]["code"] == "RATE_LIMITED"
    assert 0 < int(res.headers["Retry-After"]) <= 3600
    # người dùng khác không bị ảnh hưởng
    assert upload(client, uuid.uuid4()).status_code == 200


def test_rejected_form_does_not_count(client, db, fake_profile):
    mentee_id = uuid.uuid4()
    for _ in range(6):
        res = client.post(f"/api/ai/mentee/{mentee_id}/cv-upload", files={"file": ("cv.pdf", b"x", "application/pdf")},
                          headers=auth(mentee_id, "MENTEE"))
        assert res.json()["error"]["code"] == "CONSENT_REQUIRED"
    assert upload(client, mentee_id).status_code == 200
