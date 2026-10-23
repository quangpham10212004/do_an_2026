"""Mục tiêu nói với chatbot khác lĩnh vực trong hồ sơ (vd. hồ sơ frontend, muốn học product management) → đề nghị đổi lĩnh vực."""
import uuid

import pytest

from app.enrichment import domains
from tests.conftest import auth
from tests.test_cv_enrichment_flow import confirm_goal, upload_and_start

PM_ANSWERS = ["Minh muon chuyen sang product management, tro thanh PM trong 1 nam", "Roadmap va lam viec voi khach hang",
              "Chua biet uu tien tinh nang", "Muon dinh huong lo trinh", "Khong co gi them"]


@pytest.mark.parametrize("answers, current, expected", [
    (["Mình muốn học product management, trở thành PM"], "frontend", "product"),
    (["Muon lam quan ly san pham"], "frontend", "product"),
    (["Muốn làm app React Native"], "frontend", "mobile"),  # "react native" không bị tính là frontend
    (["Muốn làm data engineer, học machine learning"], "backend", "data"),
    (["Muốn đào sâu React và Next.js"], "frontend", None),  # trùng hồ sơ
    (["Không biết nữa, ai cũng bảo học lập trình"], "frontend", None),  # "ai" (đại từ) không phải Data/AI
    (["frontend và backend đều được"], "data", None),  # hoà => không chắc, không đề nghị
    (["frontend và backend đều được"], "frontend", None),  # hoà có lĩnh vực hiện tại => giữ
    ([], "frontend", None),
])
def test_suggest(answers, current, expected):
    assert domains.suggest(answers, current) == expected


def test_normalize():
    assert domains.normalize(" Product ") == "product"
    assert domains.normalize("game") is None and domains.normalize(None) is None


def _answer(client, conversation, mentee_id, answers):
    while conversation["status"] == "IN_PROGRESS":
        res = client.post(f"/api/ai/enrichment/conversations/{conversation['id']}/answers",
                          json={"answer": answers[conversation["currentTurn"] - 1]}, headers=auth(mentee_id, "MENTEE"))
        assert res.status_code == 200, res.text
        conversation = res.json()
    return conversation


@pytest.fixture
def mentee_id():
    return uuid.uuid4()


def test_goal_in_other_domain_suggests_switch_and_confirm_syncs_it(client, db, fake_profile, fake_mentoring, mentee_id):
    done = _answer(client, upload_and_start(client, mentee_id), mentee_id, PM_ANSWERS)
    assert done["goalStatus"] == "DRAFT"
    assert done["profileDomain"] == "backend" and done["suggestedDomain"] == "product"

    res = client.post(f"/api/ai/enrichment/conversations/{done['id']}/confirm-goal",
                      json={"goal": done["enrichedGoal"], "domain": "Product"}, headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 200, res.text
    assert res.json()["confirmedDomain"] == "product"
    assert fake_profile.enrichment_domains == ["product"]


def test_confirm_without_domain_keeps_profile_domain(client, db, fake_profile, fake_mentoring, mentee_id):
    done = _answer(client, upload_and_start(client, mentee_id), mentee_id, PM_ANSWERS)
    res = confirm_goal(client, mentee_id, done)
    assert res.status_code == 200, res.text
    assert res.json()["confirmedDomain"] is None
    assert fake_profile.enrichment_domains == [None]


def test_goal_matching_profile_domain_suggests_nothing(client, db, fake_profile, fake_mentoring, mentee_id):
    answers = ["Toi muon lam backend developer Java trong 6 thang", "System design va microservices",
               "Chua tu tin khi thiet ke database", "Muon review code", "Khong co gi them"]
    done = _answer(client, upload_and_start(client, mentee_id), mentee_id, answers)
    assert done["suggestedDomain"] is None


def test_confirm_with_unknown_domain_is_rejected(client, db, fake_profile, fake_mentoring, mentee_id):
    done = _answer(client, upload_and_start(client, mentee_id), mentee_id, PM_ANSWERS)
    res = client.post(f"/api/ai/enrichment/conversations/{done['id']}/confirm-goal",
                      json={"goal": done["enrichedGoal"], "domain": "game"}, headers=auth(mentee_id, "MENTEE"))
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_DOMAIN"
    assert fake_profile.enrichment_domains == []
