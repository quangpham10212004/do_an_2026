"""US-45 — chatbot CV: bỏ qua câu hỏi (PRD-CV-3), chọn kỹ năng gợi ý (PRD-CV-5), lưu giữ 12 tháng + gỡ kỹ năng khi xoá (PRD-CV-6)."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import storage
from app.enrichment import service
from app.errors import AiError
from tests.conftest import auth
from tests.test_cv_enrichment_flow import ANSWERS, upload_and_start

SKILLS = ["Java", "Docker", "SQL"]


@pytest.fixture
def mentee_id():
    return uuid.uuid4()


def _answer(client, mentee_id, conversation, body):
    return client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/answers",
                       json=body, headers=auth(mentee_id, "MENTEE"))


def _finish(client, mentee_id, conversation, skip_first=False):
    first = True
    while conversation["status"] == "IN_PROGRESS":
        body = {"skipped": True} if skip_first and first else {"answer": ANSWERS[conversation["currentTurn"] - 1]}
        first = False
        res = _answer(client, mentee_id, conversation, body)
        assert res.status_code == 200, res.text
        conversation = res.json()
    return conversation


def _confirm(client, mentee_id, conversation, skills):
    body = {"goal": conversation["enrichedGoal"]}
    if skills is not None:
        body["skills"] = skills
    return client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/confirm-goal",
                       json=body, headers=auth(mentee_id, "MENTEE"))


# ---- PRD-CV-3: "Bỏ qua" --------------------------------------------------------------------------------------------

def test_skip_marks_question_and_moves_on(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id, fields={"skills": SKILLS})
    res = _answer(client, mentee_id, conversation, {"skipped": True})
    assert res.status_code == 200, res.text
    after = res.json()
    first = after["messages"][0]
    assert first["skipped"] is True and first["answer"] == ""
    assert after["currentTurn"] == 2 and after["currentQuestion"]["turnNo"] == 2


def test_skipped_conversation_still_produces_a_goal(client, db, fake_profile, mentee_id):
    done = _finish(client, mentee_id, upload_and_start(client, mentee_id, fields={"skills": SKILLS}), skip_first=True)
    assert done["status"] == "COMPLETED" and done["goalStatus"] == "DRAFT" and done["enrichedGoal"]
    assert [m["skipped"] for m in done["messages"]].count(True) == 1


def test_empty_answer_without_skip_is_rejected(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id, fields={"skills": SKILLS})
    res = _answer(client, mentee_id, conversation, {"answer": "   "})
    assert res.status_code == 400 and res.json()["error"]["code"] == "ANSWER_REQUIRED"


# ---- PRD-CV-5: chip kỹ năng gợi ý ------------------------------------------------------------------------------

def test_conversation_exposes_suggested_skills(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id, fields={"skills": SKILLS})
    assert conversation["suggestedSkills"] == SKILLS and conversation["addedSkills"] == []


def test_only_chosen_skills_are_added(client, db, fake_profile, mentee_id):
    done = _finish(client, mentee_id, upload_and_start(client, mentee_id, fields={"skills": SKILLS}))
    res = _confirm(client, mentee_id, done, ["docker", "Java", "Java"])
    assert res.status_code == 200, res.text
    assert res.json()["addedSkills"] == ["Docker", "Java"]
    assert fake_profile.enrichments[-1][2] == ["Docker", "Java"]


def test_choosing_no_skills_adds_none(client, db, fake_profile, mentee_id):
    done = _finish(client, mentee_id, upload_and_start(client, mentee_id, fields={"skills": SKILLS}))
    assert _confirm(client, mentee_id, done, []).status_code == 200
    assert fake_profile.enrichments[-1][2] == []


def test_skills_omitted_adds_all_suggested(client, db, fake_profile, mentee_id):
    done = _finish(client, mentee_id, upload_and_start(client, mentee_id, fields={"skills": SKILLS}))
    assert _confirm(client, mentee_id, done, None).json()["addedSkills"] == SKILLS


def test_skill_not_in_suggestions_is_rejected(client, db, fake_profile, mentee_id):
    done = _finish(client, mentee_id, upload_and_start(client, mentee_id, fields={"skills": SKILLS}))
    res = _confirm(client, mentee_id, done, ["Kubernetes"])
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_SKILLS"
    assert fake_profile.enrichments == []


def test_pick_skills_unit():
    assert service.pick_skills(["Java", "SQL"], None) == ["Java", "SQL"]
    assert service.pick_skills(["Java", "SQL"], [" sql "]) == ["SQL"]
    with pytest.raises(AiError):
        service.pick_skills(["Java"], ["Go"])


# ---- PRD-CV-6: xoá kèm kỹ năng + lưu giữ 12 tháng ------------------------------------------------------------------

def _confirmed_cv(client, mentee_id, skills):
    done = _finish(client, mentee_id, upload_and_start(client, mentee_id, fields={"skills": SKILLS}))
    assert _confirm(client, mentee_id, done, skills).status_code == 200
    return done["cvId"]


def test_my_cvs_lists_added_skills_and_retention_date(client, db, fake_profile, mentee_id):
    cv_id = _confirmed_cv(client, mentee_id, ["Java"])
    [row] = client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE")).json()
    assert row["id"] == cv_id and row["addedSkills"] == ["Java"] and row["purgedAt"] is None
    uploaded = datetime.fromisoformat(row["uploadedAt"])
    assert datetime.fromisoformat(row["deleteAfter"]) - uploaded == timedelta(days=365)


def test_delete_with_remove_skills_calls_profile(client, db, fake_profile, mentee_id):
    cv_id = _confirmed_cv(client, mentee_id, ["Java", "SQL"])
    res = client.delete(f"/api/ai/cv/{cv_id}?removeSkills=true", headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 204
    assert fake_profile.removed_skills == [(mentee_id, ["Java", "SQL"])]


def test_delete_without_flag_keeps_profile_skills(client, db, fake_profile, mentee_id):
    cv_id = _confirmed_cv(client, mentee_id, ["Java"])
    assert client.delete(f"/api/ai/cv/{cv_id}", headers=auth(mentee_id, "MENTEE")).status_code == 204
    assert fake_profile.removed_skills == []


def test_purge_removes_file_and_raw_text_after_12_months(client, db, fake_profile, mentee_id):
    conversation = upload_and_start(client, mentee_id, fields={"skills": SKILLS})
    cv_id = conversation["cvId"]
    folder = storage._root / str(mentee_id)
    assert len(list(folder.glob("*.pdf"))) == 1

    # chưa đủ 12 tháng: không xoá gì
    later = datetime.now(timezone.utc) + timedelta(days=300)
    assert client.portal.call(service.purge_expired_cvs, later) == 0

    expired = datetime.now(timezone.utc) + timedelta(days=366)
    assert client.portal.call(service.purge_expired_cvs, expired) == 1
    assert list(folder.glob("*.pdf")) == []
    assert fake_profile.cleared_cv_files[-1][0] == mentee_id

    res = client.get(f"/api/ai/cv/{cv_id}/file", headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 410 and res.json()["error"]["code"] == "CV_PURGED"
    [row] = client.get("/api/ai/cv/mine", headers=auth(mentee_id, "MENTEE")).json()
    assert row["purgedAt"] is not None
    # chạy lại không xử lý CV đã xoá
    assert client.portal.call(service.purge_expired_cvs, expired) == 0
