"""Luồng CV Parsing + Chatbot enrichment end-to-end trong ai-service."""
import uuid

import httpx
import pytest

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


def upload(client, mentee_id, lines=CV_LINES):
    return client.post(f"/api/ai/mentee/{mentee_id}/cv-upload",
                       files={"file": ("cv.pdf", make_pdf(lines), "application/pdf")},
                       headers=auth(mentee_id, "MENTEE"))


def answer_all(client, conversation, mentee_id):
    slots = []
    while conversation["status"] == "IN_PROGRESS":
        slots.append(conversation["currentQuestion"]["slot"])
        res = client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/answers",
                          json={"answer": ANSWERS[len(slots) - 1]}, headers=auth(mentee_id, "MENTEE"))
        assert res.status_code == 200, res.text
        conversation = res.json()
    return conversation, slots


def test_upload_parses_cv_and_opens_conversation(client, db, fake_profile, mentee_id):
    res = upload(client, mentee_id)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"Java", "Spring Boot", "Docker"} <= set(body["cv"]["parsed"]["skills"])
    assert body["cv"]["parsed"]["projects"]
    assert body["conversation"]["status"] == "IN_PROGRESS"
    assert body["conversation"]["currentQuestion"]["slotLabel"]


def test_conversation_completes_and_syncs_profile(client, db, fake_profile, fake_mentoring, mentee_id):
    conversation, slots = answer_all(client, upload(client, mentee_id).json()["conversation"], mentee_id)
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
    conversation, _ = answer_all(client, upload(client, mentee_id).json()["conversation"], mentee_id)
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
    uploaded = upload(client, mentee_id).json()
    latest = client.get(f"/api/ai/mentee/{mentee_id}/enrichment/latest", headers=auth(mentee_id, "MENTEE")).json()
    assert latest["cv"]["id"] == uploaded["cv"]["id"]
    assert latest["conversation"]["id"] == uploaded["conversation"]["id"]


def test_cv_file_download_and_access_rules(client, db, fake_profile, mentee_id):
    cv_id = upload(client, mentee_id).json()["cv"]["id"]

    mine = client.get(f"/api/ai/cv/{cv_id}/file", headers=auth(mentee_id, "MENTEE"))
    assert mine.status_code == 200
    assert mine.headers["content-type"] == "application/pdf"
    assert mine.content.startswith(b"%PDF")

    # Mentor xem CV mentee khi xét yêu cầu mentoring; mentee khác thì không.
    assert client.get(f"/api/ai/cv/{cv_id}/file", headers=auth(uuid.uuid4(), "MENTOR")).status_code == 200
    assert client.get(f"/api/ai/cv/{cv_id}/file", headers=auth(uuid.uuid4(), "MENTEE")).status_code == 403


def test_upload_requires_mentee_profile(client, db, fake_profile, mentee_id):
    fake_profile.mentee = None
    res = upload(client, mentee_id)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "PROFILE_REQUIRED"


def test_cannot_upload_for_another_mentee(client, db, fake_profile, mentee_id):
    res = client.post(f"/api/ai/mentee/{uuid.uuid4()}/cv-upload",
                      files={"file": ("cv.pdf", make_pdf(CV_LINES), "application/pdf")},
                      headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 403


def test_cannot_answer_someone_elses_conversation(client, db, fake_profile, mentee_id):
    conversation = upload(client, mentee_id).json()["conversation"]
    res = client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/answers",
                      json={"answer": "Xin chao"}, headers=auth(uuid.uuid4(), "MENTEE"))
    assert res.status_code == 403
