"""US-21 (PRD-CV-4) — goal là bản nháp; chỉ "Dùng mục tiêu này" mới đổi hồ sơ, "Bỏ qua" không gửi gì."""
import asyncio
import uuid

import asyncpg
import httpx
import pytest

from app import config
from app.db import get_pool
from app.enrichment import repository as repo
from app.enrichment import service
from app.security import AuthUser
from tests.conftest import auth
from tests.test_cv_enrichment_flow import answer_all, confirm_goal, upload_and_start

EDITED = "Tro thanh backend developer Java trong 6 thang, tap trung system design va thiet ke database."


@pytest.fixture
def mentee_id():
    return uuid.uuid4()


@pytest.fixture
def draft(client, db, fake_profile, fake_mentoring, mentee_id):
    """Hội thoại đã xong với goal ở trạng thái DRAFT; kỹ năng đã duyệt = Java, Docker."""
    conversation = upload_and_start(client, mentee_id, fields={"skills": ["Java", "Docker"]})
    done, _ = answer_all(client, conversation, mentee_id)
    assert done["goalStatus"] == "DRAFT" and fake_profile.enrichments == []
    return done


def _discard(client, mentee_id, conversation_id, role="MENTEE"):
    return client.post(f"/api/ai/enrichment/conversations/{conversation_id}/discard-goal",
                       headers=auth(mentee_id, role))


def test_confirm_with_edited_goal_syncs_edited_goal_and_confirmed_skills(client, draft, fake_profile,
                                                                         fake_mentoring, mentee_id):
    res = confirm_goal(client, mentee_id, draft, goal=f"  {EDITED}  ")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["goalStatus"] == "CONFIRMED" and body["profileSynced"] is True
    assert body["confirmedGoal"] == EDITED and body["goalDecidedAt"]
    assert body["enrichedGoal"] == draft["enrichedGoal"], "bản nháp gốc được giữ để đối chiếu"
    assert fake_profile.enrichments == [(mentee_id, EDITED, ["Java", "Docker"], f"/api/ai/cv/{draft['cvId']}/file")]
    assert fake_mentoring.notifications == [(str(mentee_id), "PROFILE_ENRICHED")]


def test_confirming_twice_syncs_once(client, draft, fake_profile, fake_mentoring, mentee_id):
    assert confirm_goal(client, mentee_id, draft).status_code == 200
    again = confirm_goal(client, mentee_id, draft, goal=EDITED)
    assert again.status_code == 200
    assert again.json()["confirmedGoal"] == draft["enrichedGoal"], "lần xác nhận đầu được giữ"
    assert len(fake_profile.enrichments) == 1
    assert len(fake_mentoring.notifications) == 1


def test_concurrent_confirmations_sync_once(client, draft, fake_profile, mentee_id):
    user = AuthUser(user_id=mentee_id, email=None, role="MENTEE")
    conversation_id = uuid.UUID(draft["id"])

    async def both():
        return await asyncio.gather(*(service.confirm_goal(user, conversation_id, EDITED) for _ in range(5)))

    results = client.portal.call(both)
    assert {r.goal_status for r in results} == {"CONFIRMED"}
    assert len(fake_profile.enrichments) == 1


def test_discard_changes_nothing_and_blocks_later_confirmation(client, draft, fake_profile, fake_mentoring,
                                                                mentee_id):
    res = _discard(client, mentee_id, draft["id"])
    assert res.status_code == 200 and res.json()["goalStatus"] == "DISCARDED"
    assert res.json()["confirmedGoal"] is None and res.json()["profileSynced"] is False
    assert _discard(client, mentee_id, draft["id"]).json()["goalStatus"] == "DISCARDED"  # idempotent
    late = confirm_goal(client, mentee_id, draft)
    assert late.status_code == 409 and late.json()["error"]["code"] == "GOAL_DISCARDED"
    assert fake_profile.enrichments == [] and fake_mentoring.notifications == []


def test_cannot_discard_after_confirming(client, draft, mentee_id):
    confirm_goal(client, mentee_id, draft)
    res = _discard(client, mentee_id, draft["id"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "GOAL_ALREADY_CONFIRMED"


def test_goal_decisions_require_a_completed_conversation(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id)
    for res in (confirm_goal(client, mentee_id, conversation, goal=EDITED),
                _discard(client, mentee_id, conversation["id"])):
        assert res.status_code == 409 and res.json()["error"]["code"] == "CONVERSATION_NOT_COMPLETED"


@pytest.mark.parametrize("body", [{"goal": "ngan"}, {"goal": "          x         "}, {"goal": "x" * 3001}, {}])
def test_goal_length_is_validated(client, draft, fake_profile, mentee_id, body):
    res = client.post(f"/api/ai/enrichment/conversations/{draft['id']}/confirm-goal", json=body,
                      headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 400 and res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert fake_profile.enrichments == []


@pytest.mark.parametrize("role", ["MENTEE", "MENTOR", "ADMIN"])
def test_only_owner_can_decide(client, draft, fake_profile, role):
    other = uuid.uuid4()
    res = client.post(f"/api/ai/enrichment/conversations/{draft['id']}/confirm-goal",
                      json={"goal": EDITED}, headers=auth(other, role))
    assert res.status_code == 403
    assert _discard(client, other, draft["id"], role=role).status_code == 403
    assert fake_profile.enrichments == []


async def _age_decision(conversation_id: str, seconds: int) -> None:
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute("UPDATE enrichment_conversations SET goal_decided_at = now() - make_interval(secs => $2) "
                           "WHERE id = $1", uuid.UUID(conversation_id), float(seconds))
    finally:
        await conn.close()


def test_retry_job_only_picks_confirmed_unsynced_goals(client, db, fake_profile, fake_mentoring, mentee_id):
    async def pending():
        return {str(r["id"]) for r in await repo.pending_profile_sync(await get_pool(), service.SYNC_GRACE_SECONDS)}

    drafts = []
    for _ in range(3):
        done, _ = answer_all(client, upload_and_start(client, mentee_id), mentee_id)
        drafts.append(done)
    keep_draft, discarded, confirmed = drafts
    _discard(client, mentee_id, discarded["id"])
    fake_profile.enrichment_error = httpx.ConnectError("profile-service down")
    assert confirm_goal(client, mentee_id, confirmed).json()["profileSynced"] is False

    assert client.portal.call(pending) == set(), "xác nhận vừa xong: request đó tự gửi, job chưa đụng tới"
    for d in drafts:
        asyncio.run(_age_decision(d["id"], 600))
    assert client.portal.call(pending) == {confirmed["id"]}, "DRAFT và DISCARDED không bao giờ tự đồng bộ"

    client.portal.call(service.sync_profile, uuid.UUID(keep_draft["id"]))
    client.portal.call(service.sync_profile, uuid.UUID(discarded["id"]))
    assert fake_profile.enrichments == []
    client.portal.call(service.sync_profile, uuid.UUID(confirmed["id"]))
    client.portal.call(service.sync_profile, uuid.UUID(confirmed["id"]))  # đã gửi => không gửi lại
    assert [e[1] for e in fake_profile.enrichments] == [confirmed["enrichedGoal"]]
    assert client.portal.call(pending) == set()
