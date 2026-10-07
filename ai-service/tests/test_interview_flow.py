"""Luồng AI Interview end-to-end trong ai-service (trước đây nằm ở mentoring-service)."""
import uuid

import pytest

from tests.conftest import auth

STRONG_ANSWER = (
    "Toi dung Redis theo cache-aside voi TTL va invalidation khi ghi. Trong du an thuc te latency giam tu 300ms "
    "xuong 40ms. Toi can nhac trade-off giua consistency va hieu nang, dung index, transaction, REST API "
    "versioning, status code 201/404, pagination va idempotent. Vi du cu the o production."
)


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def start(client, mentor_id, ack=True):
    return client.post("/api/ai/interviews", json={"selfAnswerAcknowledged": ack}, headers=auth(mentor_id, "MENTOR"))


def answer_all(client, interview, mentor_id, text=STRONG_ANSWER):
    turns = 0
    while interview["status"] == "IN_PROGRESS":
        turns += 1
        res = client.post(f"/api/ai/interviews/{interview['id']}/answers", json={"answer": text},
                          headers=auth(mentor_id, "MENTOR"))
        assert res.status_code == 200, res.text
        interview = res.json()
    return interview, turns


def test_full_interview_flow(client, db, fake_profile, fake_mentoring, mentor_id):
    started = start(client, mentor_id)
    assert started.status_code == 200, started.text
    interview = started.json()
    assert interview["status"] == "IN_PROGRESS"
    assert interview["engine"] == "RULE_BASED"
    assert interview["currentQuestion"]["strategy"] == "OPENING"

    # Đang phỏng vấn: mentor không được thấy điểm/nhận xét từng câu.
    mid = client.post(f"/api/ai/interviews/{interview['id']}/answers", json={"answer": STRONG_ANSWER},
                      headers=auth(mentor_id, "MENTOR")).json()
    assert all(t["score"] is None and t["feedback"] is None for t in mid["turns"])

    final, turns = answer_all(client, mid, mentor_id)
    assert turns + 1 == final["maxTurns"]
    assert final["status"] == "PENDING_REVIEW"
    assert final["overallScore"] is not None and final["summary"]
    # Hoàn thành: điểm từng câu được mở cho mentor.
    assert all(t["score"] is not None for t in final["turns"])
    assert (mentor_id, "PENDING_REVIEW") in fake_profile.verifications
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") in fake_mentoring.notifications


def test_admin_review_syncs_verification(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = start(client, mentor_id).json()
    interview, _ = answer_all(client, interview, mentor_id)

    admin = auth(uuid.uuid4(), "ADMIN")
    pending = client.get("/api/ai/admin/interviews?status=PENDING_REVIEW", headers=admin).json()
    assert [i["id"] for i in pending] == [interview["id"]]
    assert pending[0]["mentorName"] == "Mentor Test"

    reviewed = client.post(f"/api/ai/admin/interviews/{interview['id']}/review",
                           json={"decision": "APPROVE", "note": "Tra loi tot"}, headers=admin)
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "APPROVED"
    assert fake_profile.verifications[-1] == (mentor_id, "APPROVED")

    again = client.post(f"/api/ai/admin/interviews/{interview['id']}/review",
                        json={"decision": "APPROVE"}, headers=admin)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "INTERVIEW_NOT_PENDING_REVIEW"


def test_stats_count_by_status(client, db, fake_profile, fake_mentoring, mentor_id):
    start(client, mentor_id)
    stats = client.get("/api/ai/admin/stats", headers=auth(uuid.uuid4(), "ADMIN")).json()
    assert stats == {"interviewsInProgress": 1, "interviewsPendingReview": 0,
                     "mentorsApproved": 0, "mentorsRejected": 0}


def test_start_requires_mentor_profile(client, db, fake_profile, mentor_id):
    fake_profile.mentor = None
    res = start(client, mentor_id)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "PROFILE_REQUIRED"


def test_start_twice_returns_the_open_interview(client, db, fake_profile, mentor_id):
    first = start(client, mentor_id).json()
    second = start(client, mentor_id).json()
    assert first["id"] == second["id"]


def test_cannot_answer_someone_elses_interview(client, db, fake_profile, mentor_id):
    interview = start(client, mentor_id).json()
    res = client.post(f"/api/ai/interviews/{interview['id']}/answers", json={"answer": "Xin chao"},
                      headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 403


def test_latest_for_mentor_is_204_when_empty(client, db, fake_profile, mentor_id):
    assert client.get("/api/ai/interviews/me", headers=auth(mentor_id, "MENTOR")).status_code == 204
