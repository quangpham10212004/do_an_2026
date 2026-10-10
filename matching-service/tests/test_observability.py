"""US-46 — giới hạn 20 lần tìm mentor / phút / người dùng (NFR-10); X-Request-Id, log JSON, /metrics (NFR-17)."""
import json
import logging
import uuid

from app import observability
from tests.test_api import MENTEE_ID, OTHER_ID, client, fake_pipeline, token  # noqa: F401 — fixture dùng lại


def _match(client, user_id, role="MENTEE", mentee_id=None):
    return client.get(f"/api/matching/mentors?menteeId={mentee_id or user_id}",
                      headers={"Authorization": f"Bearer {token(user_id, role)}"})


def test_21st_match_request_within_a_minute_is_429(client, fake_pipeline):
    for _ in range(20):
        assert _match(client, MENTEE_ID).status_code == 200
    res = _match(client, MENTEE_ID)
    assert res.status_code == 429 and res.json()["error"]["code"] == "RATE_LIMITED"
    assert 0 < int(res.headers["Retry-After"]) <= 60
    # người dùng khác (admin xem hộ) vẫn được
    assert _match(client, OTHER_ID, role="ADMIN", mentee_id=MENTEE_ID).status_code == 200


def test_request_id_header_and_metrics(client, fake_pipeline):
    res = client.get("/health", headers={"X-Request-Id": "trace-42"})
    assert res.headers["X-Request-Id"] == "trace-42"
    assert str(uuid.UUID(client.get("/health").headers["X-Request-Id"]))
    _match(client, MENTEE_ID)
    text = client.get("/metrics").text
    assert 'service="matching-service",method="GET",route="/api/matching/mentors",status="200"' in text


def test_json_log_line_has_service_and_request_id():
    token_ = observability.request_id.set("trace-43")
    try:
        record = logging.LogRecord("app", logging.INFO, __file__, 1, "ok", None, None)
        line = json.loads(observability.JsonFormatter("matching-service").format(record))
    finally:
        observability.request_id.reset(token_)
    assert line["service"] == "matching-service" and line["requestId"] == "trace-43"
