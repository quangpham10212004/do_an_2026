"""US-19 (PRD-CV-1) — đồng ý gửi CV tới AI bên ngoài: bắt buộc khai báo, lưu theo CV, false => không gọi DeepSeek."""
import asyncio
import uuid

import asyncpg
import httpx
import pytest

from app import config
from app.llm import deepseek
from tests.conftest import auth
from tests.helpers import make_pdf
from tests.test_cv_enrichment_flow import CV_LINES, answer_all, upload, upload_and_start


class LlmSpy:
    """DeepSeekClient THẬT (đã bật — có API key) với transport giả: mọi request HTTP tới DeepSeek đều đi qua đây."""

    def __init__(self, forbid: bool) -> None:
        self.forbid = forbid
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.forbid:
            pytest.fail(f"DeepSeek bị gọi cho CV không có đồng ý: {request.url}")
        return httpx.Response(503, json={"error": "unavailable"})  # engine tự fallback rule-based


def _install(monkeypatch, forbid: bool) -> LlmSpy:
    spy = LlmSpy(forbid)
    client = deepseek.DeepSeekClient("test-key", "http://deepseek.test", "deepseek-test",
                                     transport=httpx.MockTransport(spy))
    assert client.enabled
    monkeypatch.setattr(deepseek, "_client", client)  # get_client() ở mọi module trả về client này
    return spy


@pytest.fixture
def llm_forbidden(monkeypatch) -> LlmSpy:
    return _install(monkeypatch, forbid=True)


@pytest.fixture
def llm_allowed(monkeypatch) -> LlmSpy:
    return _install(monkeypatch, forbid=False)


@pytest.fixture
def mentee_id():
    return uuid.uuid4()


def _no_consent_upload(client, path, user_id, role):
    return client.post(path, files={"file": ("cv.pdf", make_pdf(CV_LINES), "application/pdf")},
                       headers=auth(user_id, role))


@pytest.mark.parametrize("role, path", [("MENTEE", "/api/ai/mentee/{id}/cv-upload"), ("MENTOR", "/api/ai/cv/parse")])
def test_consent_field_is_required(client, db, fake_profile, mentee_id, role, path):
    res = _no_consent_upload(client, path.format(id=mentee_id), mentee_id, role)
    assert res.status_code == 400 and res.json()["error"]["code"] == "CONSENT_REQUIRED"
    # Không lưu gì khi thiếu đồng ý.
    assert client.get("/api/ai/cv/mine", headers=auth(mentee_id, role)).json() == []


def test_consent_field_must_be_boolean(client, db, fake_profile, mentee_id):
    res = upload(client, mentee_id, consent="co le")
    assert res.status_code == 400 and res.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("consent, expected", [("true", True), ("false", False)])
def test_consent_is_stored_per_cv(client, db, fake_profile, mentee_id, consent, expected):
    cv = upload(client, mentee_id, consent=consent).json()["cv"]
    assert cv["consentExternalAi"] is expected
    mine = client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE")).json()
    assert [(c["id"], c["consentExternalAi"]) for c in mine] == [(cv["id"], expected)]


def test_without_consent_deepseek_is_never_called(client, db, fake_profile, fake_mentoring, mentee_id,
                                                   llm_forbidden):
    conversation = upload_and_start(client, mentee_id, consent="false")
    cv = client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest", headers=auth(mentee_id, "MENTEE")).json()["cv"]
    assert cv["engine"] == "RULE_BASED" and conversation["engine"] == "RULE_BASED"
    done, _ = answer_all(client, conversation, mentee_id)
    assert done["status"] == "COMPLETED" and done["enrichedGoal"]
    assert llm_forbidden.requests == []

    # Mentor điền nhanh hồ sơ từ CV không đồng ý: cũng không gọi DeepSeek.
    parsed = client.post("/api/ai/cv/parse", files={"file": ("cv.pdf", make_pdf(CV_LINES), "application/pdf")},
                         data={"consentExternalAi": "false"}, headers=auth(uuid.uuid4(), "MENTOR"))
    assert parsed.status_code == 200 and parsed.json()["engine"] == "RULE_BASED"
    assert llm_forbidden.requests == []


async def _force_engine(conversation_id: str, engine: str) -> None:
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute("UPDATE enrichment_conversations SET engine = $2 WHERE id = $1",
                           uuid.UUID(conversation_id), engine)
    finally:
        await conn.close()


def test_consent_is_checked_on_every_turn_even_if_conversation_says_deepseek(client, db, fake_profile,
                                                                            fake_mentoring, mentee_id,
                                                                            llm_forbidden):
    conversation = upload_and_start(client, mentee_id, consent="false")
    # Dữ liệu cũ / sai lệch: hội thoại ghi engine DEEPSEEK nhưng CV không có đồng ý.
    asyncio.run(_force_engine(conversation["id"], "DEEPSEEK"))
    done, _ = answer_all(client, conversation, mentee_id)
    assert done["status"] == "COMPLETED"
    assert llm_forbidden.requests == []


def test_with_consent_deepseek_is_used(client, db, fake_profile, mentee_id, llm_allowed):
    """Đối chứng: cùng cấu hình, CV có đồng ý thì DeepSeek được gọi (spy thực sự nằm trên đường gọi)."""
    created = upload(client, mentee_id, consent="true").json()
    assert created["cv"]["engine"] == "DEEPSEEK"
    assert llm_allowed.requests and llm_allowed.requests[0].url.path == "/chat/completions"


async def _insert_legacy_cv() -> bool:
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        return await conn.fetchval(
            """INSERT INTO cv_documents (user_id, file_name, storage_path, raw_text, parsed_json, engine)
               VALUES ($1, 'old.pdf', 'x/old.pdf', 'text', '{}', 'DEEPSEEK') RETURNING consent_external_ai""",
            uuid.uuid4())
    finally:
        await conn.close()


def test_rows_without_explicit_consent_default_to_false(db):
    assert asyncio.run(_insert_legacy_cv()) is False
