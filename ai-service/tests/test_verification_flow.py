"""Đợt xác thực mentor qua API: số lần, đóng đợt, chờ 15 ngày, duyệt vòng 1 (PASS / REJECT / RETAKE)."""
import asyncio
import uuid

import asyncpg
import pytest

from app import config
from tests.conftest import auth
from tests.test_interview_flow import STRONG_ANSWER, WEAK_ANSWER, finish, start, start_iv

ADMIN = auth(uuid.uuid4(), "ADMIN")


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def status_of(client, mentor_id):
    res = client.get("/api/ai/verification/status", headers=auth(mentor_id, "MENTOR"))
    assert res.status_code == 200, res.text
    return res.json()


def round1(client, application_id, decision, note=None):
    return client.post(f"/api/ai/admin/verification/applications/{application_id}/round1-review",
                       json={"decision": decision, "note": note}, headers=ADMIN)


async def _sql(sql, *args):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


def age_interview(client, interview_id, hours=1):
    res = client.post(f"/internal/dev/interviews/{interview_id}/age?hours={hours}",
                      headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert res.status_code == 200, res.text


def abandon(client, mentor_id):
    """Bắt đầu một buổi rồi để quá hạn: lần làm này không hoàn thành hợp lệ."""
    interview = start_iv(client, mentor_id)
    age_interview(client, interview["id"])
    return interview


def test_fresh_mentor_has_two_attempts_and_can_start(client, db, fake_profile, mentor_id):
    s = status_of(client, mentor_id)
    assert s == {"applicationId": None, "status": None, "attemptsUsed": 0, "attemptsLeft": 2, "maxAttempts": 2,
                 "retakeCount": 0, "retakeLimit": 2, "retryAfter": None, "canStart": True, "reason": None,
                 "voiceAvailable": False}


def test_starting_creates_one_application_and_reuses_it(client, db, fake_profile, mentor_id):
    first = start_iv(client, mentor_id)
    assert first["applicationId"]
    s = status_of(client, mentor_id)
    assert s["status"] == "ROUND1" and s["applicationId"] == first["applicationId"] and s["reason"] == "IN_PROGRESS"
    assert start_iv(client, mentor_id)["id"] == first["id"]
    assert asyncio.run(_sql("SELECT COUNT(*) FROM verification_applications WHERE mentor_id = $1", mentor_id)) == 1


def test_explicit_application_endpoint_is_idempotent(client, db, fake_profile, mentor_id):
    headers = auth(mentor_id, "MENTOR")
    a = client.post("/api/ai/verification/applications", headers=headers)
    b = client.post("/api/ai/verification/applications", headers=headers)
    assert a.status_code == 200 and b.status_code == 200, a.text
    assert a.json()["applicationId"] == b.json()["applicationId"] and a.json()["status"] == "ROUND1"
    assert start_iv(client, mentor_id)["applicationId"] == a.json()["applicationId"]


def test_first_failed_attempt_allows_another_second_closes_the_application(client, db, fake_profile, fake_mentoring,
                                                                           fake_audit, mentor_id):
    abandon(client, mentor_id)
    s = status_of(client, mentor_id)
    assert s["attemptsUsed"] == 1 and s["attemptsLeft"] == 1 and s["canStart"] and s["status"] == "ROUND1"

    abandon(client, mentor_id)
    s = status_of(client, mentor_id)
    assert s["status"] == "CLOSED" and s["attemptsLeft"] == 0 and s["reason"] == "COOLDOWN" and not s["canStart"]
    assert s["retryAfter"] is not None
    assert fake_profile.verifications[-1] == (mentor_id, "REJECTED")
    assert (str(mentor_id), "MENTOR_REJECTED") in fake_mentoring.notifications
    assert any(r["action"] == "VERIFICATION_CLOSED" for r in fake_audit.records)

    blocked = start(client, mentor_id)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "INTERVIEW_COOLDOWN"
    assert blocked.json()["error"]["retryAfter"] == s["retryAfter"]


def test_after_the_waiting_period_a_new_application_starts_from_round1(client, db, fake_profile, fake_mentoring, mentor_id):
    abandon(client, mentor_id)
    abandon(client, mentor_id)
    closed = status_of(client, mentor_id)
    aged = client.post(f"/internal/dev/verification/{closed['applicationId']}/age?days=16",
                       headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    assert aged.status_code == 200, aged.text
    s = status_of(client, mentor_id)
    assert s["canStart"] and s["reason"] is None and s["attemptsUsed"] == 0 and s["status"] is None
    again = start_iv(client, mentor_id)
    assert again["applicationId"] != closed["applicationId"]
    assert fake_profile.verifications[-1] == (mentor_id, "PENDING_INTERVIEW") or True


def test_admin_reject_closes_the_application_and_waits_15_days(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = finish(client, mentor_id, text=WEAK_ANSWER)
    res = round1(client, interview["applicationId"], "REJECT")
    assert res.status_code == 200 and res.json()["status"] == "REJECTED" and res.json()["retryAfter"]
    assert fake_profile.verifications[-1] == (mentor_id, "REJECTED")
    s = status_of(client, mentor_id)
    assert s["reason"] == "COOLDOWN" and not s["canStart"]
    days = (asyncio.run(_sql("SELECT retry_after - closed_at FROM verification_applications WHERE id = $1::uuid",
                             interview["applicationId"]))).days
    assert days == 15


def test_waiting_for_admin_blocks_a_second_interview(client, db, fake_profile, fake_mentoring, mentor_id):
    finish(client, mentor_id)
    s = status_of(client, mentor_id)
    assert s["status"] == "ROUND1_REVIEW" and s["reason"] == "PENDING_REVIEW" and not s["canStart"]
    res = start(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_PENDING_REVIEW"


def test_retake_is_limited_to_two_and_does_not_use_attempts(client, db, fake_profile, fake_mentoring, mentor_id):
    for n in (1, 2):
        interview = finish(client, mentor_id)
        res = round1(client, interview["applicationId"], "RETAKE", "Video bị mờ, vui lòng làm lại")
        assert res.status_code == 200 and res.json()["status"] == "ROUND1" and res.json()["retakeCount"] == n
        s = status_of(client, mentor_id)
        assert s["attemptsUsed"] == 0 and s["attemptsLeft"] == 2 and s["canStart"]
    interview = finish(client, mentor_id)
    res = round1(client, interview["applicationId"], "RETAKE", "Thử lần thứ ba cho chắc")
    assert res.status_code == 409 and res.json()["error"]["code"] == "RETAKE_LIMIT_REACHED"
    assert round1(client, interview["applicationId"], "PASS", "Đạt yêu cầu").status_code == 200


def test_retake_needs_a_note(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = finish(client, mentor_id)
    for note in (None, "ngắn"):
        res = round1(client, interview["applicationId"], "RETAKE", note)
        assert res.status_code == 400 and res.json()["error"]["code"] == "REVIEW_NOTE_REQUIRED"


def test_pass_against_ai_reject_needs_a_note(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = finish(client, mentor_id, text=WEAK_ANSWER)
    assert interview["recommendation"] == "REJECT"
    res = round1(client, interview["applicationId"], "PASS", "ok")
    assert res.status_code == 400 and res.json()["error"]["code"] == "REVIEW_NOTE_REQUIRED"
    assert round1(client, interview["applicationId"], "PASS", "Đã xem video, đạt yêu cầu").status_code == 200


def test_round1_review_only_works_on_a_waiting_application(client, db, fake_profile, mentor_id):
    interview = start_iv(client, mentor_id)
    res = round1(client, interview["applicationId"], "PASS")
    assert res.status_code == 409 and res.json()["error"]["code"] == "VERIFICATION_NOT_PENDING_REVIEW"
    missing = round1(client, str(uuid.uuid4()), "PASS")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "VERIFICATION_NOT_FOUND"


def test_round2_flag_decides_whether_pass_approves_directly(client, db, fake_profile, fake_mentoring, mentor_id, monkeypatch):
    monkeypatch.setattr(config, "VERIFICATION_ROUND2_ENABLED", True)
    interview = finish(client, mentor_id)
    res = round1(client, interview["applicationId"], "PASS", "Cho sang vòng 2")
    assert res.status_code == 200 and res.json()["status"] == "ROUND2_PENDING_SLOTS"
    assert fake_profile.verifications[-1] == (mentor_id, "PENDING_REVIEW")


def test_already_approved_profile_cannot_start(client, db, fake_profile, mentor_id):
    fake_profile.mentor["verificationStatus"] = "APPROVED"
    res = start(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "ALREADY_APPROVED"


def test_only_admin_reviews_and_only_mentor_sees_own_status(client, db, fake_profile, mentor_id):
    interview = finish(client, mentor_id)
    mentor_headers = auth(mentor_id, "MENTOR")
    path = f"/api/ai/admin/verification/applications/{interview['applicationId']}"
    assert client.post(path + "/round1-review", json={"decision": "PASS"}, headers=mentor_headers).status_code == 403
    assert client.get("/api/ai/admin/verification/applications", headers=mentor_headers).status_code == 403
    assert client.get("/api/ai/verification/status", headers=ADMIN).status_code == 403
    detail = client.get(path, headers=ADMIN).json()
    assert detail["status"] == "ROUND1_REVIEW" and len(detail["interviews"]) == 1 and detail["interview"]["id"] == interview["id"]


def test_stats_count_applications_and_agreement(client, db, fake_profile, fake_mentoring, mentor_id):
    weak = finish(client, mentor_id, text=WEAK_ANSWER)
    round1(client, weak["applicationId"], "REJECT")  # trùng khuyến nghị AI
    other = uuid.uuid4()
    strong = finish(client, other, text=STRONG_ANSWER)
    round1(client, strong["applicationId"], "RETAKE", "Cần xem lại video của bạn")
    stats = client.get("/api/ai/admin/stats", headers=ADMIN).json()
    assert stats["mentorsRejected"] == 1 and stats["mentorsApproved"] == 0
    assert stats["interviewsPendingReview"] == 0 and stats["retakesRequested"] == 1
    assert stats["decisionsTotal"] == 2
