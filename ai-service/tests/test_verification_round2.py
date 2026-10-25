"""Vòng 2 qua API: đề xuất giờ, chọn / đổi giờ, phòng Jitsi, báo vắng, phiếu chấm và kết luận (docs/design-mentor-verification.md §6)."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from app import config
from tests.conftest import auth
from tests.test_interview_flow import GOOD_SCORES, approve_mentor, finish, propose_and_choose

ADMIN = auth(uuid.uuid4(), "ADMIN")


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def mentor_headers(mentor_id):
    return auth(mentor_id, "MENTOR")


def status_of(client, mentor_id):
    return client.get("/api/ai/verification/status", headers=mentor_headers(mentor_id)).json()


def app_path(application_id):
    return f"/api/ai/admin/verification/applications/{application_id}"


def passed(client, mentor_id, text=None):
    """Mentor làm vòng 1 xong và admin cho qua → đợt ROUND2_PENDING_SLOTS. Trả về buổi vòng 1."""
    interview = finish(client, mentor_id) if text is None else finish(client, mentor_id, text)
    res = client.post(app_path(interview["applicationId"]) + "/round1-review", json={"decision": "PASS", "note": "Đạt vòng 1"}, headers=ADMIN)
    assert res.status_code == 200, res.text
    return interview


def scheduled(client, mentor_id, days=3):
    interview = passed(client, mentor_id)
    propose_and_choose(client, mentor_id, interview["applicationId"], ADMIN, days=days)
    return interview


def detail(client, application_id):
    return client.get(app_path(application_id), headers=ADMIN).json()


async def _sql(sql, *args):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


def move_interview(application_id, minutes_from_now):
    """Dời giờ bắt đầu của buổi vòng 2 đang chờ tới `minutes_from_now` phút so với bây giờ (kiểm thử phòng / vắng / đổi giờ)."""
    asyncio.run(_sql("UPDATE verification_interviews SET scheduled_at = now() + $2::float8 * interval '1 minute' "
                     "WHERE application_id = $1::uuid AND status = 'SCHEDULED'", application_id, minutes_from_now))


def decide(client, application_id, body):
    return client.post(app_path(application_id) + "/decision", json=body, headers=ADMIN)


# ---------- đề xuất khung giờ ----------

def test_slots_can_only_be_proposed_after_round1_passed(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = finish(client, mentor_id)  # đang chờ duyệt vòng 1
    starts = [(datetime.now(timezone.utc) + timedelta(days=2)).isoformat()]
    res = client.post(app_path(interview["applicationId"]) + "/slots", json={"startsAt": starts}, headers=ADMIN)
    assert res.status_code == 409 and res.json()["error"]["code"] == "VERIFICATION_NOT_AT_ROUND2"


def test_slots_are_validated(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = passed(client, mentor_id)
    path = app_path(interview["applicationId"]) + "/slots"
    base = datetime.now(timezone.utc) + timedelta(days=2)

    def post(starts):
        return client.post(path, json={"startsAt": [s.isoformat() for s in starts]}, headers=ADMIN)

    assert post([datetime.now(timezone.utc) + timedelta(minutes=10)]).json()["error"]["code"] == "SLOT_TOO_SOON"
    assert post([base + timedelta(hours=i) for i in range(4)]).json()["error"]["code"] == "TOO_MANY_SLOTS"
    assert post([base, base]).json()["error"]["code"] == "DUPLICATE_SLOTS"
    assert client.post(path, json={"startsAt": []}, headers=ADMIN).status_code == 400
    assert client.post(path, json={"startsAt": [base.isoformat()]}, headers=mentor_headers(mentor_id)).status_code == 403


def test_proposing_slots_notifies_the_mentor_and_opens_the_choice(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    interview = passed(client, mentor_id)
    base = datetime.now(timezone.utc) + timedelta(days=2)
    res = client.post(app_path(interview["applicationId"]) + "/slots",
                      json={"startsAt": [(base + timedelta(hours=i)).isoformat() for i in range(3)]}, headers=ADMIN)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ROUND2_PENDING_CHOICE" and len(res.json()["slots"]) == 3 and res.json()["choiceDeadline"]
    assert (str(mentor_id), "MENTOR_INTERVIEW_SLOTS_PROPOSED") in fake_mentoring.notifications
    assert fake_audit.records[-1]["action"] == "VERIFICATION_SLOTS_PROPOSED"
    s = status_of(client, mentor_id)
    assert s["status"] == "ROUND2_PENDING_CHOICE" and len(s["slots"]) == 3 and s["choiceDeadline"] and s["round2"] is None


def test_proposing_again_is_blocked_until_the_choice_deadline_passes(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = passed(client, mentor_id)
    path = app_path(interview["applicationId"]) + "/slots"
    first = [(datetime.now(timezone.utc) + timedelta(days=2)).isoformat()]
    assert client.post(path, json={"startsAt": first}, headers=ADMIN).status_code == 200
    blocked = client.post(path, json={"startsAt": first}, headers=ADMIN)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "CHOICE_PENDING"

    asyncio.run(_sql("UPDATE verification_applications SET choice_deadline = now() - interval '1 hour' WHERE id = $1::uuid",
                     interview["applicationId"]))
    late = status_of(client, mentor_id)["slots"][0]["id"]
    expired = client.post(f"/api/ai/verification/slots/{late}/choose", headers=mentor_headers(mentor_id))
    assert expired.status_code == 409 and expired.json()["error"]["code"] == "CHOICE_EXPIRED"
    second = [(datetime.now(timezone.utc) + timedelta(days=3)).isoformat()]
    again = client.post(path, json={"startsAt": second}, headers=ADMIN)
    assert again.status_code == 200
    states = [x["status"] for x in again.json()["slots"]]
    assert states.count("EXPIRED") == 1 and states.count("PROPOSED") == 1


def test_overlapping_admin_slots_only_produce_a_warning(client, db, fake_profile, fake_mentoring, mentor_id):
    scheduled(client, mentor_id, days=3)
    booked = datetime.fromisoformat(status_of(client, mentor_id)["round2"]["scheduledAt"].replace("Z", "+00:00"))
    other = passed(client, uuid.uuid4())
    path = app_path(other["applicationId"]) + "/slots"
    near = client.post(path, json={"startsAt": [(booked + timedelta(minutes=20)).isoformat()]}, headers=ADMIN)
    assert near.status_code == 200, near.text  # chỉ cảnh báo, không chặn (D8: không có thời lượng nên không tự tính được chồng lịch)
    assert len(near.json()["warnings"]) == 1
    third = passed(client, uuid.uuid4())
    far = client.post(app_path(third["applicationId"]) + "/slots", json={"startsAt": [(booked + timedelta(hours=3)).isoformat()]}, headers=ADMIN)
    assert far.status_code == 200 and far.json()["warnings"] == []


# ---------- chọn giờ ----------

def test_mentor_chooses_a_slot_and_the_interview_is_scheduled(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = passed(client, mentor_id)
    base = datetime.now(timezone.utc) + timedelta(days=2)
    client.post(app_path(interview["applicationId"]) + "/slots",
                json={"startsAt": [(base + timedelta(hours=i)).isoformat() for i in range(3)]}, headers=ADMIN)
    slots = status_of(client, mentor_id)["slots"]
    path = f"/api/ai/verification/slots/{slots[1]['id']}/choose"
    assert client.post(path, headers=mentor_headers(uuid.uuid4())).status_code == 403
    assert client.post(path, headers=ADMIN).status_code == 403
    res = client.post(path, headers=mentor_headers(mentor_id))
    assert res.status_code == 200, res.text
    s = res.json()
    assert s["status"] == "ROUND2_SCHEDULED" and s["slots"] == [] and s["round2"]["canReschedule"] is True
    chosen_at = datetime.fromisoformat(s["round2"]["scheduledAt"].replace("Z", "+00:00"))
    assert abs((chosen_at - (base + timedelta(hours=1))).total_seconds()) < 1  # đúng khung mentor chọn, không phải khung đầu
    assert (str(mentor_id), "MENTOR_INTERVIEW_SCHEDULED") in fake_mentoring.notifications
    again = client.post(path, headers=mentor_headers(mentor_id))
    assert again.status_code == 409 and again.json()["error"]["code"] in ("NOT_AWAITING_CHOICE", "SLOT_NOT_AVAILABLE")
    view = detail(client, interview["applicationId"])
    assert [x["status"] for x in view["slots"]].count("CHOSEN") == 1 and [x["status"] for x in view["slots"]].count("EXPIRED") == 2
    assert len(view["round2Interviews"]) == 1 and view["round2Interviews"][0]["status"] == "SCHEDULED"
    assert fake_profile.verifications[-1] == (mentor_id, "PENDING_REVIEW")


# ---------- đổi giờ (D9) ----------

def test_reschedule_needs_notice_and_is_limited_to_two(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    interview = scheduled(client, mentor_id, days=3)
    application_id = interview["applicationId"]
    move_interview(application_id, 23 * 60)  # còn 23 giờ: quá muộn
    late = client.post("/api/ai/verification/round2/reschedule", headers=mentor_headers(mentor_id))
    assert late.status_code == 409 and late.json()["error"]["code"] == "RESCHEDULE_TOO_LATE"
    assert status_of(client, mentor_id)["round2"]["rescheduleBlockedReason"] == "RESCHEDULE_TOO_LATE"

    for n in (1, 2):
        move_interview(application_id, 3 * 24 * 60)
        res = client.post("/api/ai/verification/round2/reschedule", headers=mentor_headers(mentor_id))
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "ROUND2_PENDING_SLOTS" and res.json()["rescheduleCount"] == n
        assert fake_audit.records[-1]["action"] == "VERIFICATION_ROUND2_RESCHEDULED"
        propose_and_choose(client, mentor_id, application_id, ADMIN)
    move_interview(application_id, 3 * 24 * 60)
    third = client.post("/api/ai/verification/round2/reschedule", headers=mentor_headers(mentor_id))
    assert third.status_code == 409 and third.json()["error"]["code"] == "RESCHEDULE_LIMIT"
    assert detail(client, application_id)["rescheduleCount"] == 2
    assert [x["status"] for x in detail(client, application_id)["round2Interviews"]].count("RESCHEDULED") == 2


def test_reschedule_requires_a_scheduled_interview(client, db, fake_profile, mentor_id):
    res = client.post("/api/ai/verification/round2/reschedule", headers=mentor_headers(mentor_id))
    assert res.status_code == 409 and res.json()["error"]["code"] == "NOT_SCHEDULED"


# ---------- phòng Jitsi ----------

def test_room_is_closed_before_the_window_then_opens_for_both_with_a_join_log(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id, days=3)
    application_id = interview["applicationId"]
    closed = client.get("/api/ai/verification/round2/room", headers=mentor_headers(mentor_id))
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "ROOM_CLOSED"

    move_interview(application_id, 5)  # trong 10 phút trước giờ bắt đầu → phòng đã mở
    mentor_room = client.get("/api/ai/verification/round2/room", headers=mentor_headers(mentor_id))
    assert mentor_room.status_code == 200, mentor_room.text
    body = mentor_room.json()
    assert body["moderator"] is False and body["domain"] == "meet.test" and body["roomName"].startswith("mentorhub-verify-")
    admin_room = client.get("/api/ai/verification/round2/room", params={"applicationId": application_id}, headers=ADMIN)
    assert admin_room.status_code == 200 and admin_room.json()["moderator"] is True
    assert admin_room.json()["roomName"] == body["roomName"]

    tokens = fake_mentoring.room_tokens
    assert [t["moderator"] for t in tokens] == [False, True] and tokens[0]["userId"] == mentor_id
    window = datetime.fromisoformat(body["expiresAt"].replace("Z", "+00:00")) - datetime.fromisoformat(body["opensAt"].replace("Z", "+00:00"))
    assert abs(window.total_seconds() - (config.VERIFICATION_ROOM_MAX_HOURS * 3600 + config.VERIFICATION_ROOM_OPENS_BEFORE_MINUTES * 60)) < 2
    view = detail(client, application_id)["round2Interviews"][0]
    assert view["mentorJoinedAt"] and view["adminJoinedAt"]


def test_room_needs_admin_application_id_and_the_right_mentor(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id, days=3)
    move_interview(interview["applicationId"], 5)
    assert client.get("/api/ai/verification/round2/room", headers=ADMIN).status_code == 400
    assert client.get("/api/ai/verification/round2/room", headers=auth(uuid.uuid4(), "MENTOR")).status_code == 404  # mentor khác chưa có đợt
    assert client.get("/api/ai/verification/round2/room", headers=auth(uuid.uuid4(), "MENTEE")).status_code == 403
    assert fake_mentoring.room_tokens == []


def test_room_is_only_for_a_scheduled_interview(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = passed(client, mentor_id)
    res = client.get("/api/ai/verification/round2/room", params={"applicationId": interview["applicationId"]}, headers=ADMIN)
    assert res.status_code == 409 and res.json()["error"]["code"] == "ROOM_NOT_AVAILABLE"


# ---------- vắng mặt ----------

def test_mentor_absence_follows_the_join_log_and_two_absences_close_the_application(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id, days=3)
    application_id = interview["applicationId"]
    path = app_path(application_id) + "/mentor-absent"
    assert client.post(path, headers=mentor_headers(mentor_id)).status_code == 403

    move_interview(application_id, 5)
    early = client.post(path, headers=ADMIN)
    assert early.status_code == 409 and early.json()["error"]["code"] == "GRACE_NOT_ELAPSED"

    move_interview(application_id, -15)  # quá 10 phút chờ, mentor chưa vào phòng
    first = client.post(path, headers=ADMIN)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "ROUND2_PENDING_SLOTS" and first.json()["noShowCount"] == 1
    assert [x["status"] for x in first.json()["round2Interviews"]] == ["MENTOR_NO_SHOW"]

    propose_and_choose(client, mentor_id, application_id, ADMIN)
    move_interview(application_id, -15)
    second = client.post(path, headers=ADMIN)
    assert second.status_code == 200 and second.json()["status"] == "CLOSED" and second.json()["noShowCount"] == 2
    assert fake_profile.verifications[-1] == (mentor_id, "REJECTED")
    s = status_of(client, mentor_id)
    assert s["reason"] == "COOLDOWN" and not s["canStart"] and s["retryAfter"]


def test_a_mentor_who_joined_cannot_be_reported_absent(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id, days=3)
    move_interview(interview["applicationId"], 5)
    assert client.get("/api/ai/verification/round2/room", headers=mentor_headers(mentor_id)).status_code == 200
    move_interview(interview["applicationId"], -30)
    res = client.post(app_path(interview["applicationId"]) + "/mentor-absent", headers=ADMIN)
    assert res.status_code == 409 and res.json()["error"]["code"] == "MENTOR_ALREADY_JOINED"


# ---------- kết luận với phiếu chấm ----------

def test_approve_scores_the_interview_and_activates_the_mentor(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    interview = scheduled(client, mentor_id)
    application_id = interview["applicationId"]
    res = decide(client, application_id, {"decision": "APPROVE", "scores": GOOD_SCORES, "note": "Đạt yêu cầu sau phỏng vấn"})
    assert res.status_code == 200, res.text
    view = res.json()
    assert view["status"] == "APPROVED" and view["reviewedAt"]
    r2 = view["round2Interviews"][0]
    assert r2["status"] == "COMPLETED" and r2["totalScore"] == 74.5 and r2["recommendation"] == "APPROVE" and r2["scores"] == GOOD_SCORES
    assert {c["criterion"] for c in r2["comparison"]} == {"technical", "depth", "communication", "mentoring"}
    assert fake_profile.verifications[-1] == (mentor_id, "APPROVED")
    assert (str(mentor_id), "MENTOR_APPROVED") in fake_mentoring.notifications
    entry = fake_audit.records[-1]
    assert entry["action"] == "VERIFICATION_ROUND2_APPROVED" and entry["after"]["totalScore"] == 74.5
    assert status_of(client, mentor_id)["reason"] == "ALREADY_APPROVED"
    again = decide(client, application_id, {"decision": "APPROVE", "scores": GOOD_SCORES, "note": "lần hai"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "NOT_SCHEDULED"  # phiếu đã chốt không sửa được


def test_full_two_round_helper_reaches_approved(client, db, fake_profile, fake_mentoring, mentor_id):
    assert approve_mentor(client, mentor_id, finish(client, mentor_id))["status"] == "APPROVED"


def test_approve_and_reject_need_the_complete_scoring_sheet(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    application_id = interview["applicationId"]
    for decision in ("APPROVE", "REJECT"):
        none = decide(client, application_id, {"decision": decision, "note": "không có phiếu chấm"})
        assert none.status_code == 400 and none.json()["error"]["code"] == "SCORES_REQUIRED"
    partial = decide(client, application_id, {"decision": "APPROVE", "scores": {"technical": 8}})
    assert partial.json()["error"]["code"] == "SCORES_REQUIRED"
    out = decide(client, application_id, {"decision": "APPROVE", "scores": {**GOOD_SCORES, "depth": 12}})
    assert out.json()["error"]["code"] == "SCORE_OUT_OF_RANGE"
    assert client.post(app_path(application_id) + "/decision", json={"decision": "APPROVE", "scores": GOOD_SCORES},
                       headers=mentor_headers(mentor_id)).status_code == 403


def test_extreme_scores_need_a_reason_per_criterion(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    scores = {**GOOD_SCORES, "technical": 2, "depth": 9}
    res = decide(client, interview["applicationId"], {"decision": "REJECT", "scores": scores, "note": "Kiến thức nền yếu rõ rệt"})
    assert res.status_code == 400 and res.json()["error"]["code"] == "SCORE_NOTE_REQUIRED"
    assert set(res.json()["error"]["criteria"]) == {"technical", "depth"}
    ok = decide(client, interview["applicationId"], {"decision": "REJECT", "scores": scores, "note": "Kiến thức nền yếu rõ rệt",
                                                     "scoreNotes": {"technical": "Không giải thích được index là gì", "depth": "Dự án thực tế có số liệu rõ"}})
    assert ok.status_code == 200, ok.text


def test_a_decision_against_the_recommendation_needs_a_note(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    low = {k: 4 for k in GOOD_SCORES}  # tổng 40 → khuyến nghị REJECT
    res = decide(client, interview["applicationId"], {"decision": "APPROVE", "scores": low})
    assert res.status_code == 400 and res.json()["error"]["code"] == "REVIEW_NOTE_REQUIRED"
    assert decide(client, interview["applicationId"], {"decision": "APPROVE", "scores": low, "note": "Đã trao đổi thêm, đạt"}).status_code == 200


def test_blocking_condition_caps_the_recommendation(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    scores = {k: 10 for k in GOOD_SCORES}
    scores["authenticity"] = 2
    res = decide(client, interview["applicationId"], {"decision": "APPROVE", "scores": scores,
                                                      "scoreNotes": {"authenticity": "Hồ sơ không khớp lời nói", **{k: "Rất xuất sắc, nhiều ví dụ" for k in GOOD_SCORES if k != "authenticity"}}})
    assert res.status_code == 200, res.text
    r2 = res.json()["round2Interviews"][0]
    assert r2["recommendation"] == "NEEDS_REVIEW" and r2["blocked"] is True and res.json()["status"] == "APPROVED"


def test_reject_closes_the_application_for_15_days(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    low = {k: 4 for k in GOOD_SCORES}
    res = decide(client, interview["applicationId"], {"decision": "REJECT", "scores": low})
    assert res.status_code == 200 and res.json()["status"] == "REJECTED" and res.json()["retryAfter"]
    assert fake_profile.verifications[-1] == (mentor_id, "REJECTED")
    assert (str(mentor_id), "MENTOR_REJECTED") in fake_mentoring.notifications
    days = asyncio.run(_sql("SELECT EXTRACT(day FROM (retry_after - closed_at)) FROM verification_applications WHERE id = $1::uuid",
                            interview["applicationId"]))
    assert days == 15
    assert status_of(client, mentor_id)["reason"] == "COOLDOWN"


def test_admin_reschedule_does_not_count_against_the_mentor(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    res = decide(client, interview["applicationId"], {"decision": "RESCHEDULE", "note": "Admin bận việc đột xuất"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ROUND2_PENDING_SLOTS" and res.json()["rescheduleCount"] == 0 and res.json()["noShowCount"] == 0
    assert [x["status"] for x in res.json()["round2Interviews"]] == ["RESCHEDULED"]
    propose_and_choose(client, mentor_id, interview["applicationId"], ADMIN)
    assert status_of(client, mentor_id)["status"] == "ROUND2_SCHEDULED"


def test_mentor_never_sees_the_scoring_sheet(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = scheduled(client, mentor_id)
    decide(client, interview["applicationId"], {"decision": "APPROVE", "scores": GOOD_SCORES, "note": "Đạt"})
    s = status_of(client, mentor_id)
    assert "scores" not in str(s) and "round2Interviews" not in s
    assert client.get(app_path(interview["applicationId"]), headers=mentor_headers(mentor_id)).status_code == 403
