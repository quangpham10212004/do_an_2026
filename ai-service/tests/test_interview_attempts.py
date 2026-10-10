"""US-22 (PRD-AIV-1, PRD-AIV-4) — xác nhận tự trả lời, số lần phỏng vấn, thời gian chờ, khoá / mở khoá."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from app import config
from app.interview import attempts
from app.interview.attempts import InterviewOutcome
from tests.conftest import auth
from tests.test_interview_flow import WEAK_ANSWER, answer_all, start

NOW = datetime(2026, 11, 10, 3, 0, tzinfo=timezone.utc)
WEEK = timedelta(days=7)


def outcome(status, days_ago, reviewed_days_ago=None):
    reviewed = None if reviewed_days_ago is None else NOW - timedelta(days=reviewed_days_ago)
    return InterviewOutcome(status, NOW - timedelta(days=days_ago), reviewed)


# ---------- quy tắc thuần ----------

def test_no_interview_yet_has_all_attempts():
    e = attempts.evaluate([], NOW, 3, WEEK)
    assert (e.attempts_used, e.attempts_left, e.locked, e.cooldown_until) == (0, 3, False, None)


def test_in_progress_and_retake_do_not_count_as_attempts():
    e = attempts.evaluate([outcome("RETAKE_REQUESTED", 3, 2), outcome("IN_PROGRESS", 1)], NOW, 3, WEEK)
    assert e.attempts_used == 0 and e.attempts_left == 3 and e.cooldown_until is None


def test_cooldown_seven_days_after_rejection():
    e = attempts.evaluate([outcome("REJECTED", 3, 2)], NOW, 3, WEEK)
    assert e.attempts_used == 1 and e.attempts_left == 2
    assert e.cooldown_until == NOW - timedelta(days=2) + WEEK


def test_cooldown_expires():
    assert attempts.evaluate([outcome("REJECTED", 9, 8)], NOW, 3, WEEK).cooldown_until is None


def test_cooldown_only_follows_the_latest_interview():
    # bị từ chối rồi admin yêu cầu làm lại => buổi mới nhất là RETAKE_REQUESTED, không phải chờ
    e = attempts.evaluate([outcome("REJECTED", 3, 2), outcome("RETAKE_REQUESTED", 1, 0)], NOW, 3, WEEK)
    assert e.cooldown_until is None and e.attempts_used == 1


def test_three_rejections_lock_without_cooldown():
    e = attempts.evaluate([outcome("REJECTED", 30, 29), outcome("REJECTED", 20, 19), outcome("REJECTED", 2, 1)],
                          NOW, 3, WEEK)
    assert e.locked and e.attempts_left == 0 and e.cooldown_until is None


def test_pending_review_counts_as_attempt():
    e = attempts.evaluate([outcome("REJECTED", 30, 29), outcome("PENDING_REVIEW", 1)], NOW, 3, WEEK)
    assert e.attempts_used == 2 and not e.locked


# ---------- API ----------

async def _shift_review(mentor_id, days):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute("""UPDATE interviews SET reviewed_at = reviewed_at - make_interval(days => $2),
                                                  created_at = created_at - make_interval(days => $2)
                              WHERE mentor_id = $1""", mentor_id, days)
    finally:
        await conn.close()


def shift_review(mentor_id, days):
    asyncio.run(_shift_review(mentor_id, days))


def reject(client, interview_id, admin):
    res = client.post(f"/api/ai/admin/interviews/{interview_id}/review",
                      json={"decision": "REJECT", "note": "Cần trả lời chi tiết hơn"}, headers=admin)
    assert res.status_code == 200, res.text


def finish(client, mentor_id):
    res = start(client, mentor_id)
    assert res.status_code == 200, res.text
    interview, _ = answer_all(client, res.json(), mentor_id, text=WEAK_ANSWER)
    return interview


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def eligibility(client, mentor_id):
    res = client.get("/api/ai/interviews/eligibility", headers=auth(mentor_id, "MENTOR"))
    assert res.status_code == 200, res.text
    return res.json()


def test_start_requires_self_answer_acknowledgement(client, db, fake_profile, mentor_id):
    for res in (client.post("/api/ai/interviews", headers=auth(mentor_id, "MENTOR")),
                start(client, mentor_id, ack=False)):
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "SELF_ANSWER_ACK_REQUIRED"
    started = start(client, mentor_id)
    assert started.status_code == 200 and started.json()["selfAnswerAcknowledged"] is True


def test_eligibility_cooldown_lock_and_unlock(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    admin = auth(uuid.uuid4(), "ADMIN")
    assert eligibility(client, mentor_id) == {"attemptsUsed": 0, "attemptsLeft": 3, "maxAttempts": 3,
                                              "cooldownUntil": None, "locked": False, "canStart": True,
                                              "reason": None, "questionCount": 5}
    for n in range(1, 4):
        interview = finish(client, mentor_id)
        assert eligibility(client, mentor_id)["reason"] == "PENDING_REVIEW"
        reject(client, interview["id"], admin)
        e = eligibility(client, mentor_id)
        assert e["attemptsUsed"] == n and e["attemptsLeft"] == 3 - n
        if n < 3:
            assert e["reason"] == "COOLDOWN" and e["cooldownUntil"] is not None and not e["canStart"]
            blocked = start(client, mentor_id)
            assert blocked.status_code == 409
            assert blocked.json()["error"]["code"] == "INTERVIEW_COOLDOWN"
            assert blocked.json()["error"]["retryAfter"] == e["cooldownUntil"]
            shift_review(mentor_id, 8)  # 8 ngày sau: hết thời gian chờ
            assert eligibility(client, mentor_id)["canStart"]

    locked = eligibility(client, mentor_id)
    assert locked["locked"] and locked["reason"] == "LOCKED" and locked["cooldownUntil"] is None
    res = start(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_LOCKED"

    # chỉ admin được mở khoá
    path = f"/api/ai/admin/interviews/mentors/{mentor_id}/unlock"
    assert client.post(path, json={}, headers=auth(mentor_id, "MENTOR")).status_code == 403
    assert client.get(f"/api/ai/admin/interviews/mentors/{mentor_id}/eligibility", headers=admin).json()["locked"]
    unlocked = client.post(path, json={"note": "Đã trao đổi trực tiếp"}, headers=admin)
    assert unlocked.status_code == 200, unlocked.text
    assert unlocked.json()["attemptsUsed"] == 0 and unlocked.json()["canStart"]
    assert fake_audit.records[-1]["action"] == "INTERVIEW_ATTEMPTS_UNLOCKED"
    assert fake_audit.records[-1]["targetId"] == str(mentor_id)
    assert fake_audit.records[-1]["before"]["locked"] is True and fake_audit.records[-1]["after"]["locked"] is False

    again = client.post(path, json={}, headers=admin)
    assert again.status_code == 409 and again.json()["error"]["code"] == "INTERVIEW_NOT_LOCKED"
    assert start(client, mentor_id).status_code == 200


# ---------- US-43 (PRD-AIV-2, AIV-3) ----------

def test_answer_length_rules():
    assert attempts.answer_length_error("x" * 49) == "ANSWER_TOO_SHORT"
    assert attempts.answer_length_error("   " + "x" * 50 + "   ") is None
    assert attempts.answer_length_error("x" * 3000) is None
    assert attempts.answer_length_error("x" * 3001) == "ANSWER_TOO_LONG"


def test_abandoned_counts_as_attempt():
    e = attempts.evaluate([outcome("ABANDONED", 5)], NOW, 3, WEEK)
    assert e.attempts_used == 1 and e.cooldown_until is None


def test_resume_deadline_follows_last_activity():
    started = NOW - timedelta(hours=100)
    assert attempts.resume_deadline(started, None) == started + timedelta(hours=72)
    assert attempts.resume_deadline(started, NOW - timedelta(hours=1)) == NOW + timedelta(hours=71)


def test_short_and_long_answers_are_rejected(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = start(client, mentor_id).json()
    headers = auth(mentor_id, "MENTOR")
    short = client.post(f"/api/ai/interviews/{interview['id']}/answers", json={"answer": "Khong biet"}, headers=headers)
    assert short.status_code == 400 and short.json()["error"]["code"] == "ANSWER_TOO_SHORT"
    long = client.post(f"/api/ai/interviews/{interview['id']}/answers", json={"answer": "a " * 1600}, headers=headers)
    assert long.status_code == 400 and long.json()["error"]["code"] == "ANSWER_TOO_LONG"
    assert interview["answerMinChars"] == 50 and interview["softTimerSeconds"] == 360
    assert interview["resumeDeadline"] is not None


def test_interview_idle_72h_is_abandoned_and_counts(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    interview = start(client, mentor_id).json()
    internal = {"X-Internal-Token": config.INTERNAL_API_KEY}
    aged = client.post(f"/internal/dev/interviews/{interview['id']}/age?hours=73", headers=internal)
    assert aged.status_code == 200, aged.text
    headers = auth(mentor_id, "MENTOR")
    res = client.post(f"/api/ai/interviews/{interview['id']}/answers", json={"answer": WEAK_ANSWER}, headers=headers)
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_ABANDONED"
    e = client.get("/api/ai/interviews/eligibility", headers=headers).json()
    assert e["attemptsUsed"] == 1 and e["attemptsLeft"] == 2 and e["canStart"]
    again = start(client, mentor_id).json()
    assert again["id"] != interview["id"] and again["status"] == "IN_PROGRESS"


def test_interview_resumable_within_72h(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = start(client, mentor_id).json()
    client.post(f"/internal/dev/interviews/{interview['id']}/age?hours=71",
                headers={"X-Internal-Token": config.INTERNAL_API_KEY})
    resumed = start(client, mentor_id).json()
    assert resumed["id"] == interview["id"] and resumed["status"] == "IN_PROGRESS"
