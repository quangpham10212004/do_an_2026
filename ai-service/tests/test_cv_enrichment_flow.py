"""Luồng CV Parsing + Chatbot enrichment end-to-end trong ai-service."""
import asyncio
import uuid

import httpx
import pytest

from app import config, storage
from app.clients import mentoring, profile
from app.enrichment import service
from tests.conftest import auth
from tests.helpers import make_pdf

CV_LINES = [
    "TRAN MINH KHOA",
    "Junior Backend Developer",
    "",
    "WORK EXPERIENCE",
    "FinTech Startup - Backend Intern (06/2024 - 06/2025)",
    "- Built REST API endpoints with Spring Boot and PostgreSQL",
    "",
    "PROJECTS",
    "Movie Ticket Booking System",
    "- Java, Spring Boot, MySQL, Redis cache for seat availability",
    "",
    "SKILLS",
    "Java, Spring Boot, SQL, Git, Docker",
]

ANSWERS = ["Toi muon lam backend developer Java trong 6 thang toi", "System design va microservices",
           "Chua tu tin khi thiet ke database", "Muon review code va luyen phong van", "Khong co gi them"]


@pytest.fixture
def mentee_id():
    return uuid.uuid4()


def upload(client, mentee_id, lines=CV_LINES, consent="false"):
    return client.post(f"/api/ai/mentee/{mentee_id}/cv-upload",
                       files={"file": ("cv.pdf", make_pdf(lines), "application/pdf")},
                       data={"consentExternalAi": consent}, headers=auth(mentee_id, "MENTEE"))


def confirm_parsed(client, mentee_id, cv):
    """US-20: người dùng giữ nguyên kết quả parse (đổi tên currentRole -> role)."""
    p = cv["parsed"]
    fields = {"role": p["currentRole"], "skills": p["skills"], "yearsExperience": p["yearsExperience"],
              "projects": p["projects"], "education": p["education"]}
    res = client.put(f"/api/ai/cv/{cv['id']}/confirmed-fields", json=fields, headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 200, res.text
    return res.json()


def start_chat(client, mentee_id, cv_id):
    return client.post(f"/api/ai/cv/{cv_id}/enrichment-conversation", headers=auth(mentee_id, "MENTEE"))


def upload_and_start(client, mentee_id, consent="false", fields=None):
    """upload → duyệt thông tin (mặc định giữ nguyên kết quả parse) → bắt đầu chatbot; trả về hội thoại."""
    res = upload(client, mentee_id, consent=consent)
    assert res.status_code == 200, res.text
    cv = res.json()["cv"]
    if fields is None:
        confirm_parsed(client, mentee_id, cv)
    else:
        assert client.put(f"/api/ai/cv/{cv['id']}/confirmed-fields", json=fields,
                          headers=auth(mentee_id, "MENTEE")).status_code == 200
    started = start_chat(client, mentee_id, cv["id"])
    assert started.status_code == 200, started.text
    return started.json()["conversation"]


def answer_all(client, conversation, mentee_id):
    slots = []
    while conversation["status"] == "IN_PROGRESS":
        slots.append(conversation["currentQuestion"]["slot"])
        res = client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/answers",
                          json={"answer": ANSWERS[len(slots) - 1]}, headers=auth(mentee_id, "MENTEE"))
        assert res.status_code == 200, res.text
        conversation = res.json()
    return conversation, slots


def test_upload_parses_cv_without_starting_chat_or_touching_profile(client, db, fake_profile, mentee_id):
    res = upload(client, mentee_id)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"Java", "Spring Boot", "Docker"} <= set(body["cv"]["parsed"]["skills"])
    assert body["cv"]["parsed"]["projects"]
    assert body["cv"]["confirmedFields"] is None
    assert body["conversation"] is None  # US-20: chatbot chỉ bắt đầu sau bước duyệt
    assert fake_profile.enrichments == []


def test_conversation_opens_after_review(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id)
    assert conversation["status"] == "IN_PROGRESS"
    assert conversation["currentQuestion"]["slotLabel"]
    assert fake_profile.enrichments == []


def test_conversation_completes_and_syncs_profile(client, db, fake_profile, fake_mentoring, mentee_id):
    conversation, slots = answer_all(client, upload_and_start(client, mentee_id), mentee_id)
    assert len(slots) == conversation["maxTurns"]
    assert len(set(slots)) == len(slots), "chatbot không được hỏi lặp cùng một slot"
    assert conversation["status"] == "COMPLETED"
    assert conversation["enrichedGoal"]
    assert conversation["profileSynced"] is True

    synced_mentee, goal, skills, cv_url = fake_profile.enrichments[-1]
    assert synced_mentee == mentee_id
    assert goal == conversation["enrichedGoal"]
    assert "Spring Boot" in skills
    assert cv_url == f"/api/ai/cv/{conversation['cvId']}/file"
    assert (str(mentee_id), "PROFILE_ENRICHED") in fake_mentoring.notifications


def test_profile_sync_is_retried_when_profile_service_fails(client, db, fake_profile, fake_mentoring, mentee_id):
    fake_profile.enrichment_error = httpx.ConnectError("profile-service down")
    conversation, _ = answer_all(client, upload_and_start(client, mentee_id), mentee_id)
    assert conversation["status"] == "COMPLETED"
    assert conversation["profileSynced"] is False
    assert fake_profile.enrichments == []

    client.portal.call(service.sync_profile, uuid.UUID(conversation["id"]))
    retried = client.get(f"/api/ai/enrichment/conversations/{conversation['id']}",
                         headers=auth(mentee_id, "MENTEE")).json()
    assert retried["profileSynced"] is True
    assert fake_profile.enrichments[-1][0] == mentee_id


def test_latest_returns_cv_and_conversation(client, db, fake_profile, mentee_id):
    assert client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest",
                      headers=auth(mentee_id, "MENTEE")).status_code == 204
    conversation = upload_and_start(client, mentee_id)
    latest = client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest", headers=auth(mentee_id, "MENTEE")).json()
    assert latest["cv"]["id"] == conversation["cvId"]
    assert latest["conversation"]["id"] == conversation["id"]

    # CV mới hơn chưa duyệt: latest trả CV đó, chưa có hội thoại.
    newer = upload(client, mentee_id).json()["cv"]
    latest = client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest", headers=auth(mentee_id, "MENTEE")).json()
    assert latest["cv"]["id"] == newer["id"] and latest["conversation"] is None


def test_cv_file_download_and_access_rules(client, db, fake_profile, fake_mentoring, mentee_id):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    url = f"/api/ai/cv/{cv_id}/file"

    mine = client.get(url, headers=auth(mentee_id, "MENTEE"))
    assert mine.status_code == 200
    assert mine.headers["content-type"] == "application/pdf"
    assert mine.content.startswith(b"%PDF")
    assert client.get(url, headers=auth(uuid.uuid4(), "ADMIN")).status_code == 200
    assert client.get(url, headers=auth(uuid.uuid4(), "MENTEE")).status_code == 403
    # Chủ CV / admin không cần hỏi mentoring-service.
    assert fake_mentoring.relationship_checks == []


def test_mentor_can_only_download_cv_of_related_mentee(client, db, fake_profile, fake_mentoring, mentee_id):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    url = f"/api/ai/cv/{cv_id}/file"
    related, unrelated = uuid.uuid4(), uuid.uuid4()
    fake_mentoring.relationships = {(related, mentee_id)}

    assert client.get(url, headers=auth(related, "MENTOR")).status_code == 200
    denied = client.get(url, headers=auth(unrelated, "MENTOR"))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "FORBIDDEN"
    assert fake_mentoring.relationship_checks == [(related, mentee_id), (unrelated, mentee_id)]


def test_mentor_cv_download_fails_closed_when_mentoring_service_down(client, db, fake_profile, mentee_id, monkeypatch):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    # Không giả lập is_related: gọi thật tới một cổng không có ai lắng nghe.
    monkeypatch.setattr(config, "MENTORING_SERVICE_URL", "http://127.0.0.1:9")
    monkeypatch.setattr(config, "RELATIONSHIP_CHECK_TIMEOUT_SECONDS", 1.0)
    res = client.get(f"/api/ai/cv/{cv_id}/file", headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 403


@pytest.mark.parametrize("status, body, expected", [
    (200, {"related": True}, True),
    (200, {"related": False}, False),
    (500, {"error": {"code": "INTERNAL_ERROR"}}, False),
    (200, ["không phải object"], False),
])
def test_is_related_parses_response_and_fails_closed(monkeypatch, status, body, expected):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"], seen["params"] = request.url.path, dict(request.url.params)
        seen["token"] = request.headers.get("X-Internal-Token")
        return httpx.Response(status, json=body)

    fake_client = httpx.AsyncClient(base_url="http://mentoring", transport=httpx.MockTransport(handler),
                                    headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    monkeypatch.setattr(mentoring, "client_for", lambda _: fake_client)
    mentor_id, mentee_id = uuid.uuid4(), uuid.uuid4()
    assert asyncio.run(mentoring.is_related(mentor_id, mentee_id)) is expected
    assert seen["path"] == "/internal/relationships"
    assert seen["params"] == {"mentorId": str(mentor_id), "menteeId": str(mentee_id)}
    assert seen["token"] == config.INTERNAL_API_KEY


def test_upload_requires_mentee_profile(client, db, fake_profile, mentee_id):
    fake_profile.mentee = None
    res = upload(client, mentee_id)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "PROFILE_REQUIRED"


def test_cannot_upload_for_another_mentee(client, db, fake_profile, mentee_id):
    res = client.post(f"/api/ai/mentee/{uuid.uuid4()}/cv-upload",
                      files={"file": ("cv.pdf", make_pdf(CV_LINES), "application/pdf")},
                      data={"consentExternalAi": "false"}, headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 403


def test_cannot_answer_someone_elses_conversation(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id)
    res = client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/answers",
                      json={"answer": "Xin chao"}, headers=auth(uuid.uuid4(), "MENTEE"))
    assert res.status_code == 403


# ---------------- Xoá CV / danh sách CV của tôi (chính sách dữ liệu CV) ----------------


def _cv_files(owner_id):
    folder = storage._root / str(owner_id)
    return sorted(folder.glob("*.pdf")) if folder.exists() else []


def test_owner_deletes_cv_with_conversation_and_file(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id)
    cv_id, conversation_id = conversation["cvId"], conversation["id"]
    assert len(_cv_files(mentee_id)) == 1

    res = client.delete(f"/api/ai/cv/{cv_id}", headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 204 and res.content == b""

    assert _cv_files(mentee_id) == []
    assert client.get(f"/api/ai/cv/{cv_id}/file", headers=auth(mentee_id, "MENTEE")).json()["error"]["code"] \
        == "CV_NOT_FOUND"
    gone = client.get(f"/api/ai/enrichment/conversations/{conversation_id}", headers=auth(mentee_id, "MENTEE"))
    assert gone.status_code == 404 and gone.json()["error"]["code"] == "CONVERSATION_NOT_FOUND"
    assert client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE")).json() == []
    # Hồ sơ đang trỏ tới CV này => nhờ profile-service gỡ tham chiếu.
    assert fake_profile.cleared_cv_files == [(mentee_id, f"/api/ai/cv/{cv_id}/file")]


def test_admin_can_delete_any_cv(client, db, fake_profile, mentee_id):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    assert client.delete(f"/api/ai/cv/{cv_id}", headers=auth(uuid.uuid4(), "ADMIN")).status_code == 204
    assert _cv_files(mentee_id) == []


@pytest.mark.parametrize("role", ["MENTEE", "MENTOR"])
def test_other_users_and_mentors_cannot_delete_cv(client, db, fake_profile, fake_mentoring, mentee_id, role):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    # Kể cả mentor đang hướng dẫn mentee (được phép tải) cũng không được xoá.
    other = uuid.uuid4()
    fake_mentoring.relationships = {(other, mentee_id)}
    res = client.delete(f"/api/ai/cv/{cv_id}", headers=auth(other, role))
    assert res.status_code == 403 and res.json()["error"]["code"] == "FORBIDDEN"
    assert len(_cv_files(mentee_id)) == 1
    assert fake_profile.cleared_cv_files == []


def test_delete_unknown_cv_is_404(client, db, fake_profile, mentee_id):
    res = client.delete(f"/api/ai/cv/{uuid.uuid4()}", headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 404 and res.json()["error"]["code"] == "CV_NOT_FOUND"


def test_delete_succeeds_when_file_already_missing(client, db, fake_profile, mentee_id):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    for f in _cv_files(mentee_id):
        f.unlink()
    assert client.delete(f"/api/ai/cv/{cv_id}", headers=auth(mentee_id, "MENTEE")).status_code == 204
    assert client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE")).json() == []


def test_delete_succeeds_when_profile_service_is_down(client, db, fake_profile, mentee_id):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]
    fake_profile.clear_error = httpx.ConnectError("profile-service down")
    assert client.delete(f"/api/ai/cv/{cv_id}", headers=auth(mentee_id, "MENTEE")).status_code == 204
    assert client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE")).json() == []


def test_my_cvs_lists_only_callers_cvs_newest_first(client, db, fake_profile, mentee_id):
    first = upload(client, mentee_id).json()["cv"]["id"]
    second = upload(client, mentee_id).json()["cv"]["id"]
    upload(client, uuid.uuid4())  # CV của mentee khác

    res = client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 200
    items = res.json()
    assert [i["id"] for i in items] == [second, first]
    assert set(items[0]) == {"id", "fileName", "uploadedAt", "fileUrl", "consentExternalAi"}
    assert items[0]["fileName"] == "cv.pdf"
    assert items[0]["fileUrl"] == f"/api/ai/cv/{second}/file"
    assert client.get("/api/ai/cv/mine", headers=auth(uuid.uuid4(), "MENTOR")).json() == []
    assert client.get("/api/ai/cv/mine").status_code == 401


def test_clear_cv_file_calls_profile_service_internal_endpoint(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"], seen["path"] = request.method, request.url.path
        seen["params"] = dict(request.url.params)
        return httpx.Response(204)

    fake_client = httpx.AsyncClient(base_url="http://profile", transport=httpx.MockTransport(handler))
    monkeypatch.setattr(profile, "client_for", lambda _: fake_client)
    user_id = uuid.uuid4()
    asyncio.run(profile.clear_cv_file(user_id, "/api/ai/cv/abc/file"))
    assert seen == {"method": "DELETE", "path": f"/internal/profile/{user_id}/cv-file",
                    "params": {"cvFileUrl": "/api/ai/cv/abc/file"}}
