"""US-20 (PRD-CV-2) — xem lại thông tin trích xuất: sửa/bỏ từng trường trước khi dùng; parse không ghi hồ sơ."""
import uuid

import pytest

from tests.conftest import auth
from tests.test_cv_enrichment_flow import answer_all, start_chat, upload, upload_and_start

FIELDS = {
    "role": "  Backend Developer  ",
    "skills": ["Go", " go ", "", "Kubernetes"],
    "yearsExperience": 3,
    "projects": [{"name": "API gateway", "description": "Viết bằng Go", "technologies": ["Go"]}],
    "education": ["PTIT", "  "],
}


@pytest.fixture
def mentee_id():
    return uuid.uuid4()


def _put(client, cv_id, user_id, body, role="MENTEE"):
    return client.put(f"/api/ai/cv/{cv_id}/confirmed-fields", json=body, headers=auth(user_id, role))


def test_confirmed_fields_are_cleaned_and_stored_without_touching_profile(client, db, fake_profile, mentee_id):
    cv = upload(client, mentee_id).json()["cv"]
    res = _put(client, cv["id"], mentee_id, FIELDS)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["confirmedFields"] == {
        "role": "Backend Developer", "skills": ["Go", "Kubernetes"], "yearsExperience": 3,
        "projects": [{"name": "API gateway", "description": "Viết bằng Go", "technologies": ["Go"]}],
        "education": ["PTIT"]}
    assert body["confirmedAt"]
    assert "Java" in body["parsed"]["skills"], "kết quả parse gốc được giữ nguyên để đối chiếu"
    assert fake_profile.enrichments == []

    # Sửa lại lần nữa: ghi đè; bỏ hết mọi mục cũng hợp lệ.
    emptied = _put(client, cv["id"], mentee_id, {"role": "", "skills": [], "projects": [], "education": []}).json()
    assert emptied["confirmedFields"] == {"role": None, "skills": [], "yearsExperience": None, "projects": [],
                                          "education": []}
    latest = client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest", headers=auth(mentee_id, "MENTEE")).json()
    assert latest["cv"]["confirmedFields"] == emptied["confirmedFields"]


@pytest.mark.parametrize("patch", [
    {"skills": [f"Skill {i}" for i in range(31)]},
    {"skills": ["x" * 61]},
    {"yearsExperience": 46},
    {"yearsExperience": -1},
    {"projects": [{"name": "  ", "description": ""}]},
    {"projects": [{"name": f"P{i}"} for i in range(9)]},
    {"education": ["x" * 201]},
    {"role": "x" * 121},
    {"skills": "Java"},
])
def test_invalid_confirmed_fields_are_rejected(client, db, fake_profile, mentee_id, patch):
    cv = upload(client, mentee_id).json()["cv"]
    res = _put(client, cv["id"], mentee_id, {**FIELDS, **patch})
    assert res.status_code == 400 and res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest",
                      headers=auth(mentee_id, "MENTEE")).json()["cv"]["confirmedFields"] is None


@pytest.mark.parametrize("role", ["MENTEE", "MENTOR", "ADMIN"])
def test_only_owner_can_confirm_fields(client, db, fake_profile, fake_mentoring, mentee_id, role):
    cv = upload(client, mentee_id).json()["cv"]
    other = uuid.uuid4()
    fake_mentoring.relationships = {(other, mentee_id)}  # kể cả mentor được phép xem file CV
    res = _put(client, cv["id"], other, FIELDS, role=role)
    assert res.status_code == 403 and res.json()["error"]["code"] == "FORBIDDEN"


def test_confirm_unknown_cv_is_404(client, db, mentee_id):
    res = _put(client, uuid.uuid4(), mentee_id, FIELDS)
    assert res.status_code == 404 and res.json()["error"]["code"] == "CV_NOT_FOUND"


def test_chat_cannot_start_before_review(client, db, fake_profile, mentee_id):
    cv = upload(client, mentee_id).json()["cv"]
    res = start_chat(client, mentee_id, cv["id"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "CV_NOT_REVIEWED"


def test_only_owner_can_start_chat_and_starting_twice_returns_same_conversation(client, db, fake_profile,
                                                                                mentee_id):
    conversation = upload_and_start(client, mentee_id)
    assert start_chat(client, uuid.uuid4(), conversation["cvId"]).status_code == 403
    again = start_chat(client, mentee_id, conversation["cvId"])
    assert again.status_code == 200 and again.json()["conversation"]["id"] == conversation["id"]


def test_chat_uses_confirmed_fields_not_raw_parse(client, db, fake_profile, mentee_id):
    # CV mẫu có Java/Spring Boot và có dự án; người dùng chỉ giữ Go và bỏ dự án.
    conversation = upload_and_start(client, mentee_id, fields={"skills": ["Go"], "projects": []})
    first = conversation["currentQuestion"]["question"]
    assert "Go" in first and "Java" not in first, first
    done, slots = answer_all(client, conversation, mentee_id)
    assert "PROJECT_EXPERIENCE" in slots, "không còn dự án nào sau khi duyệt => chatbot hỏi về dự án"
    assert "(từ CV): Go." in done["enrichedGoal"], done["enrichedGoal"]  # nền tảng = chỉ kỹ năng đã duyệt
    # Chỉ kỹ năng đã duyệt được gửi sang hồ sơ.
    assert [e[2] for e in fake_profile.enrichments] == [["Go"]]
