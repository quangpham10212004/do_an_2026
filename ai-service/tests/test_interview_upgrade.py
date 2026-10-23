"""Bản chốt v2.0 §3 — mentor đã duyệt xin nâng cấp sau 90 ngày."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from app import config
from app.interview import attempts
from tests.conftest import auth
from tests.test_interview_flow import STRONG_ANSWER, WEAK_ANSWER, answer_all, start
from tests.test_interview_tier import _set_score, review

NOW = datetime(2026, 10, 23, tzinfo=timezone.utc)
WAIT = timedelta(days=90)


def test_upgrade_available_90_days_after_the_latest_mark():
    assert attempts.upgrade_available_at(None, None, WAIT) is None
    assert attempts.upgrade_available_at(NOW, None, WAIT) == NOW + WAIT
    assert attempts.upgrade_available_at(NOW - timedelta(days=200), NOW, WAIT) == NOW + WAIT
    assert attempts.upgrade_available_at(NOW, NOW - timedelta(days=200), WAIT) == NOW + WAIT


def test_is_higher_tier():
    assert attempts.is_higher_tier("SENIOR", "JUNIOR")
    assert attempts.is_higher_tier("EXPERT", "SENIOR")
    assert not attempts.is_higher_tier("JUNIOR", "JUNIOR")
    assert not attempts.is_higher_tier("JUNIOR", "SENIOR")


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


@pytest.fixture
def approved(fake_profile):
    """Mentor JUNIOR được xếp cấp 100 ngày trước => đã qua mốc 90 ngày."""
    assigned = datetime.now(timezone.utc) - timedelta(days=100)
    fake_profile.mentor.update(verificationStatus="APPROVED", tier="JUNIOR",
                               tierAssignedAt=assigned.isoformat().replace("+00:00", "Z"))
    return fake_profile


def eligibility(client, mentor_id):
    res = client.get("/api/ai/interviews/eligibility", headers=auth(mentor_id, "MENTOR"))
    assert res.status_code == 200, res.text
    return res.json()


def upgrade_pending(client, mentor_id, score, text=STRONG_ANSWER):
    res = start(client, mentor_id)
    assert res.status_code == 200, res.text
    assert res.json()["kind"] == "UPGRADE" and res.json()["fromTier"] == "JUNIOR"
    interview, _ = answer_all(client, res.json(), mentor_id, text)
    asyncio.run(_set_score(interview["id"], score))
    return interview["id"]


async def _age_upgrades(mentor_id, days):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute("UPDATE interviews SET reviewed_at = reviewed_at - make_interval(days => $2) "
                           "WHERE mentor_id = $1 AND kind = 'UPGRADE'", mentor_id, days)
    finally:
        await conn.close()


def test_approved_mentor_may_apply_after_90_days(client, db, approved, fake_mentoring, mentor_id):
    e = eligibility(client, mentor_id)
    assert e["kind"] == "UPGRADE" and e["currentTier"] == "JUNIOR" and e["canStart"] and e["reason"] is None


def test_upgrade_waits_90_days_after_the_tier_was_assigned(client, db, approved, mentor_id):
    approved.mentor["tierAssignedAt"] = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    e = eligibility(client, mentor_id)
    assert e["reason"] == "UPGRADE_COOLDOWN" and not e["canStart"] and e["upgradeAvailableAt"]
    res = start(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "UPGRADE_COOLDOWN"
    assert res.json()["error"]["retryAfter"] == e["upgradeAvailableAt"]


def test_expert_cannot_apply(client, db, approved, mentor_id):
    approved.mentor["tier"] = "EXPERT"
    assert eligibility(client, mentor_id)["reason"] == "TIER_MAX"
    res = start(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "TIER_MAX"


def test_mentor_stays_approved_while_the_upgrade_is_reviewed(client, db, approved, fake_mentoring, mentor_id):
    upgrade_pending(client, mentor_id, 80)
    assert approved.verifications == []  # không hạ về PENDING_REVIEW => vẫn trong matching, vẫn nhận đặt lịch
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") in fake_mentoring.notifications
    assert eligibility(client, mentor_id)["reason"] == "PENDING_REVIEW"


def test_approve_upgrade_assigns_the_higher_tier(client, db, approved, fake_mentoring, mentor_id):
    iid = upgrade_pending(client, mentor_id, 80)
    res = review(client, iid, decision="APPROVE")
    assert res.status_code == 200, res.text
    assert approved.verifications == [(mentor_id, "APPROVED")] and approved.tiers == [(mentor_id, "SENIOR")]
    assert (str(mentor_id), "MENTOR_TIER_UPGRADED") in fake_mentoring.notifications


def test_upgrade_cannot_move_a_mentor_down_or_sideways(client, db, approved, fake_mentoring, mentor_id):
    iid = upgrade_pending(client, mentor_id, 65)  # đề xuất JUNIOR = cấp hiện tại
    assert review(client, iid, decision="APPROVE").json()["error"]["code"] == "TIER_NOT_HIGHER"
    approved.mentor["tier"] = "SENIOR"  # admin đã đổi cấp trong lúc chờ duyệt => so với cấp hiện tại
    res = review(client, iid, decision="APPROVE", tier="SENIOR", note="Trả lời tốt hơn lần trước")
    assert res.json()["error"]["code"] == "TIER_NOT_HIGHER"
    assert approved.verifications == []


def test_rejected_upgrade_keeps_the_mentor_and_restarts_the_90_days(client, db, approved, fake_mentoring, mentor_id):
    iid = upgrade_pending(client, mentor_id, 40, WEAK_ANSWER)
    assert review(client, iid, decision="REJECT").status_code == 200
    assert approved.verifications == []  # giữ APPROVED + JUNIOR
    assert (str(mentor_id), "MENTOR_TIER_UPGRADE_REJECTED") in fake_mentoring.notifications
    e = eligibility(client, mentor_id)
    # Không tính vào 3 lượt / chờ 7 ngày của phỏng vấn xác thực, mà chờ 90 ngày tính từ lần bị từ chối.
    assert e["attemptsUsed"] == 0 and e["cooldownUntil"] is None
    assert e["reason"] == "UPGRADE_COOLDOWN"
    assert datetime.fromisoformat(e["upgradeAvailableAt"]) > datetime.now(timezone.utc) + timedelta(days=89)
    asyncio.run(_age_upgrades(mentor_id, 91))
    assert eligibility(client, mentor_id)["canStart"]


def test_retake_on_upgrade_keeps_the_mentor_and_allows_an_immediate_restart(client, db, approved, fake_mentoring, mentor_id):
    iid = upgrade_pending(client, mentor_id, 70)
    assert review(client, iid, decision="REQUEST_RETAKE", note="Câu 3 cần ví dụ thực tế hơn").status_code == 200
    assert approved.verifications == []  # không về PENDING_INTERVIEW
    assert eligibility(client, mentor_id)["canStart"]
    assert start(client, mentor_id).json()["kind"] == "UPGRADE"
