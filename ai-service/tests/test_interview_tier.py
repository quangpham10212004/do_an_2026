"""Bản chốt v2.0 §3 — đề xuất cấp độ từ điểm AI và admin gán cấp khi duyệt."""
import asyncio
import uuid

import asyncpg
import pytest

from app import config
from app.interview import rubric
from tests.conftest import auth
from tests.test_interview_flow import STRONG_ANSWER, WEAK_ANSWER, answer_all, start


def test_suggest_tier_thresholds():
    assert rubric.suggest_tier(None) is None
    assert rubric.suggest_tier(59.9) is None
    assert rubric.suggest_tier(60) == "JUNIOR"
    assert rubric.suggest_tier(74.9) == "JUNIOR"
    assert rubric.suggest_tier(75) == "SENIOR"
    assert rubric.suggest_tier(87.9) == "SENIOR"
    assert rubric.suggest_tier(88) == "EXPERT"
    assert rubric.suggest_tier(100) == "EXPERT"


async def _set_score(interview_id, score):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute("UPDATE interviews SET overall_score = $2 WHERE id = $1::uuid", interview_id, score)
    finally:
        await conn.close()


def pending(client, mentor_id, score, text=STRONG_ANSWER):
    interview, _ = answer_all(client, start(client, mentor_id).json(), mentor_id, text)
    asyncio.run(_set_score(interview["id"], score))
    return interview["id"]


def review(client, interview_id, **body):
    return client.post(f"/api/ai/admin/interviews/{interview_id}/review", json=body,
                       headers=auth(uuid.uuid4(), "ADMIN"))


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def test_admin_view_shows_suggested_tier_but_mentor_does_not(client, db, fake_profile, fake_mentoring, mentor_id):
    iid = pending(client, mentor_id, 80)
    admin_view = client.get(f"/api/ai/interviews/{iid}", headers=auth(uuid.uuid4(), "ADMIN")).json()
    mentor_view = client.get(f"/api/ai/interviews/{iid}", headers=auth(mentor_id, "MENTOR")).json()
    assert admin_view["suggestedTier"] == "SENIOR"
    assert mentor_view["suggestedTier"] is None


def test_approve_defaults_to_the_suggested_tier(client, db, fake_profile, fake_mentoring, mentor_id):
    iid = pending(client, mentor_id, 90)
    res = review(client, iid, decision="APPROVE")
    assert res.status_code == 200, res.text
    assert fake_profile.tiers[-1] == (mentor_id, "EXPERT")


def test_admin_may_pick_a_different_tier_with_a_note(client, db, fake_profile, fake_mentoring, mentor_id):
    iid = pending(client, mentor_id, 90)
    assert review(client, iid, decision="APPROVE", tier="SENIOR").json()["error"]["code"] == "REVIEW_NOTE_REQUIRED"
    res = review(client, iid, decision="APPROVE", tier="SENIOR", note="Chưa đủ kinh nghiệm dẫn dắt nhóm")
    assert res.status_code == 200, res.text
    assert fake_profile.tiers[-1] == (mentor_id, "SENIOR")


def test_admin_may_pick_any_tier_as_long_as_there_is_a_reason(client, db, fake_profile, fake_mentoring, mentor_id):
    iid = pending(client, mentor_id, 90)
    res = review(client, iid, decision="APPROVE", tier="JUNIOR", note="Ghi chú đủ dài để hợp lệ")
    assert res.status_code == 200, res.text
    assert fake_profile.tiers[-1] == (mentor_id, "JUNIOR")


def test_approving_below_the_pass_mark_needs_an_explicit_tier_and_a_note(client, db, fake_profile, fake_mentoring, mentor_id):
    iid = pending(client, mentor_id, 55, WEAK_ANSWER)
    note = "Phỏng vấn lại đã ổn, duyệt cấp thấp nhất"
    # AI khuyến nghị REJECT => thiếu ghi chú bị chặn trước (PRD-AIV-9), rồi mới tới yêu cầu chọn cấp
    assert review(client, iid, decision="APPROVE").json()["error"]["code"] == "REVIEW_NOTE_REQUIRED"
    assert review(client, iid, decision="APPROVE", note=note).json()["error"]["code"] == "TIER_REQUIRED"
    res = review(client, iid, decision="APPROVE", tier="JUNIOR", note=note)
    assert res.status_code == 200, res.text
    assert fake_profile.tiers[-1] == (mentor_id, "JUNIOR")


def test_reject_sends_no_tier(client, db, fake_profile, fake_mentoring, mentor_id):
    iid = pending(client, mentor_id, 40, WEAK_ANSWER)
    assert review(client, iid, decision="REJECT").status_code == 200
    assert fake_profile.tiers[-1] == (mentor_id, None)
