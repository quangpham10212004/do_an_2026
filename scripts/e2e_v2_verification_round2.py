#!/usr/bin/env python3
"""
E2E xác thực mentor — vòng 2: admin phỏng vấn qua Jitsi (docs/design-mentor-verification.md §6).

    python3 scripts/e2e_v2_verification_round2.py

Kiểm tra: PASS vòng 1 → admin đề xuất giờ → mentor chọn → phòng Jitsi (JWT ký bởi mentoring-service: đúng phòng, admin là moderator,
khung giờ, trần kỹ thuật, nhật ký vào phòng) → phiếu chấm 5 tiêu chí → APPROVE (mentor xuất hiện trong matching), REJECT (chờ 15 ngày),
RESCHEDULE; đổi giờ (≥ 24 giờ, ≤ 2 lần); mentor vắng hai lần đóng đợt. Cần stack chạy với mentoring-service (token phòng).
Dùng endpoint dev (X-Internal-Token, không có ở prod) ai-service POST /internal/dev/verification/{id}/move-interview để dời giờ buổi.
Không kiểm hai người thật vào cùng phòng Jitsi (cần trình duyệt + `--profile jitsi`) — việc đó làm tay.
"""
import base64
import json
import sys
import time
import uuid
from datetime import datetime, timezone

from common import (AI, AUTH, MATCHING, MENTORING, PROFILE, ApiError, GOOD_ROUND2_SCORES, call, choose_first_slot,
                    complete_voice_interview, propose_slots, round1_review, round2_decision)

RUN = uuid.uuid4().hex[:6]
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def error_of(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error") or {}) if isinstance(e.body, dict) else {}
    return None, {}


def new_mentor(name):
    m = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.round2.{name}.{RUN}@test.local", "password": "Passw0rd!",
                                                    "role": "MENTOR", "fullName": f"V2 Round2 {name}"})
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"V2 Round2 {name} {RUN}", "domain": "backend", "skills": ["Java", "Redis"],
        "bio": "Backend engineer 8 nam, huong dan junior xay dung REST API.", "yearsExperience": 8,
        "hourlyRate": 100000, "capacity": 3, "isAvailable": True, "portfolioLinks": []}, token=m["accessToken"])
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=m["accessToken"])
    return m


def status_of(token):
    return call("GET", f"{AI}/api/ai/verification/status", token=token)


def profile_status(m):
    return call("GET", f"{PROFILE}/api/profile/mentor/{m['userId']}", token=m["accessToken"])["verificationStatus"]


def move(application_id, minutes):
    call("POST", f"{AI}/internal/dev/verification/{application_id}/move-interview?minutes={minutes}", internal=True)


def claims(jwt):
    payload = jwt.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def in_matching(m):
    mentee = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.round2.mentee.{uuid.uuid4().hex[:6]}@test.local",
                                                         "password": "Passw0rd!", "role": "MENTEE", "fullName": "V2 Round2 Mentee"})
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", {
        "displayName": "V2 Round2 Mentee", "domain": "backend", "currentLevel": "BEGINNER", "skills": ["Java"],
        "goal": "Hoc Java backend va Redis", "portfolioLinks": []}, token=mentee["accessToken"])
    for _ in range(20):  # matching-service lập chỉ mục embedding bất đồng bộ
        res = call("GET", f"{MATCHING}/api/matching/mentors?menteeId={mentee['userId']}&limit=50", token=mentee["accessToken"])
        if any(x["mentorId"] == m["userId"] for x in res["mentors"]):
            return True
        time.sleep(1)
    return False


def passed_mentor(name, admin):
    m = new_mentor(name)
    iv = complete_voice_interview(m["accessToken"])
    round1_review(admin, iv, "PASS", "Dat vong 1 e2e")
    return m, iv


def slots_and_choice(admin):
    m, iv = passed_mentor("main", admin)
    t, application_id = m["accessToken"], iv["applicationId"]
    s = status_of(t)
    check("PASS vòng 1 → đợt ROUND2_PENDING_SLOTS, hồ sơ vẫn PENDING_REVIEW, mentor chưa vào matching",
          s["status"] == "ROUND2_PENDING_SLOTS" and profile_status(m) == "PENDING_REVIEW", s)
    status, err = error_of(lambda: call("POST", f"{AI}/api/ai/admin/verification/applications/{application_id}/slots",
                                        {"startsAt": [datetime.now(timezone.utc).isoformat()]}, token=admin))
    check("Khung giờ quá gần → 400 SLOT_TOO_SOON", status == 400 and err.get("code") == "SLOT_TOO_SOON", (status, err))
    proposed = propose_slots(admin, application_id, days=3, count=3)
    s = status_of(t)
    check("Đề xuất 3 khung → ROUND2_PENDING_CHOICE, mentor thấy khung giờ + hạn chọn",
          proposed["status"] == "ROUND2_PENDING_CHOICE" and len(s["slots"]) == 3 and s["choiceDeadline"], s)
    status, err = error_of(lambda: propose_slots(admin, application_id))
    check("Đề xuất lại khi mentor chưa chọn và chưa hết hạn → 409 CHOICE_PENDING", status == 409 and err.get("code") == "CHOICE_PENDING", (status, err))
    chosen = choose_first_slot(t)
    check("Mentor chọn → ROUND2_SCHEDULED, còn đổi giờ được", chosen["status"] == "ROUND2_SCHEDULED" and chosen["round2"]["canReschedule"], chosen)
    status, _ = error_of(lambda: call("POST", f"{AI}/api/ai/verification/slots/{s['slots'][1]['id']}/choose", token=t))
    check("Chọn khung khác sau khi đã chốt → 409", status == 409, status)
    return m, iv


def room_and_decision(admin, m, iv):
    t, application_id = m["accessToken"], iv["applicationId"]
    status, err = error_of(lambda: call("GET", f"{AI}/api/ai/verification/round2/room", token=t))
    check("Chưa tới giờ → 409 ROOM_CLOSED", status == 409 and err.get("code") == "ROOM_CLOSED", (status, err))
    move(application_id, 5)
    mentor_room = call("GET", f"{AI}/api/ai/verification/round2/room", token=t)
    admin_room = call("GET", f"{AI}/api/ai/verification/round2/room?applicationId={application_id}", token=admin)
    mc, ac = claims(mentor_room["jwt"]), claims(admin_room["jwt"])
    check("Hai bên cùng một phòng mentorhub-verify-<uuid>", mentor_room["roomName"] == admin_room["roomName"] == mc["room"] == ac["room"]
          and mentor_room["roomName"].startswith("mentorhub-verify-"), mentor_room["roomName"])
    check("Admin là moderator, mentor là khách", ac["context"]["user"]["moderator"] == "true" and mc["context"]["user"]["moderator"] == "false"
          and mentor_room["moderator"] is False and admin_room["moderator"] is True)
    now = time.time()
    check("JWT: iss mentorhub, aud jitsi, nbf ≤ now < exp, trần kỹ thuật ≈ 4 giờ sau giờ bắt đầu",
          mc["iss"] == "mentorhub" and "jitsi" in (mc["aud"] if isinstance(mc["aud"], list) else [mc["aud"]])
          and mc["nbf"] <= now < mc["exp"] and 4 * 3600 <= mc["exp"] - now <= 4 * 3600 + 600, (mc["nbf"], mc["exp"], now))
    detail = call("GET", f"{AI}/api/ai/admin/verification/applications/{application_id}", token=admin)
    r2 = detail["round2Interviews"][0]
    check("Nhật ký vào phòng ghi cả hai bên", r2["mentorJoinedAt"] and r2["adminJoinedAt"])
    status, _ = error_of(lambda: call("GET", f"{AI}/api/ai/verification/round2/room", token=call("POST", f"{AUTH}/api/auth/register", {
        "email": f"v2.round2.out.{uuid.uuid4().hex[:6]}@test.local", "password": "Passw0rd!", "role": "MENTOR", "fullName": "Out"})["accessToken"]))
    check("Mentor khác không vào được phòng → 404", status == 404, status)

    status, err = error_of(lambda: round2_decision(admin, application_id, "APPROVE", {"technical": 8}, "thiếu phiếu"))
    check("APPROVE thiếu phiếu → 400 SCORES_REQUIRED", status == 400 and err.get("code") == "SCORES_REQUIRED", (status, err))
    low = {**GOOD_ROUND2_SCORES, "technical": 2}
    status, err = error_of(lambda: round2_decision(admin, application_id, "REJECT", low, "Kiến thức nền yếu"))
    check("Điểm ≤ 2 thiếu lý do → 400 SCORE_NOTE_REQUIRED", status == 400 and err.get("code") == "SCORE_NOTE_REQUIRED", (status, err))
    done = round2_decision(admin, application_id, "APPROVE", GOOD_ROUND2_SCORES, "Dat yeu cau sau phong van")
    r2 = done["round2Interviews"][0]
    check("APPROVE → đợt APPROVED, phiếu 74,5 điểm khuyến nghị APPROVE, có so sánh với AI",
          done["status"] == "APPROVED" and r2["totalScore"] == 74.5 and r2["recommendation"] == "APPROVE" and r2["comparison"], done["status"])
    check("Hồ sơ mentor APPROVED", profile_status(m) == "APPROVED")
    check("Mentor đã duyệt xuất hiện trong kết quả matching", in_matching(m))


def reschedule_rules(admin):
    m, iv = passed_mentor("resched", admin)
    t, application_id = m["accessToken"], iv["applicationId"]
    propose_slots(admin, application_id)
    choose_first_slot(t)
    move(application_id, 23 * 60)
    status, err = error_of(lambda: call("POST", f"{AI}/api/ai/verification/round2/reschedule", token=t))
    check("Đổi giờ khi còn < 24 giờ → 409 RESCHEDULE_TOO_LATE", status == 409 and err.get("code") == "RESCHEDULE_TOO_LATE", (status, err))
    for n in (1, 2):
        move(application_id, 3 * 24 * 60)
        s = call("POST", f"{AI}/api/ai/verification/round2/reschedule", token=t)
        check(f"Đổi giờ lần {n} → ROUND2_PENDING_SLOTS, đã đổi {n}/2", s["status"] == "ROUND2_PENDING_SLOTS" and s["rescheduleCount"] == n, s)
        propose_slots(admin, application_id)
        choose_first_slot(t)
    move(application_id, 3 * 24 * 60)
    status, err = error_of(lambda: call("POST", f"{AI}/api/ai/verification/round2/reschedule", token=t))
    check("Đổi giờ lần 3 → 409 RESCHEDULE_LIMIT", status == 409 and err.get("code") == "RESCHEDULE_LIMIT", (status, err))
    done = round2_decision(admin, application_id, "RESCHEDULE", note="Admin dời lịch đột xuất")
    check("Admin RESCHEDULE → về chờ đề xuất giờ, không tính lần của mentor",
          done["status"] == "ROUND2_PENDING_SLOTS" and done["rescheduleCount"] == 2 and done["noShowCount"] == 0, done["status"])


def absence_and_reject(admin):
    m, iv = passed_mentor("absent", admin)
    t, application_id = m["accessToken"], iv["applicationId"]
    path = f"{AI}/api/ai/admin/verification/applications/{application_id}/mentor-absent"
    propose_slots(admin, application_id)
    choose_first_slot(t)
    move(application_id, 5)
    status, err = error_of(lambda: call("POST", path, token=admin))
    check("Báo vắng khi chưa hết thời gian chờ → 409 GRACE_NOT_ELAPSED", status == 409 and err.get("code") == "GRACE_NOT_ELAPSED", (status, err))
    move(application_id, -15)
    first = call("POST", path, token=admin)
    check("Vắng lần 1 (mentor chưa vào phòng) → về chờ đề xuất giờ, noShowCount = 1", first["status"] == "ROUND2_PENDING_SLOTS" and first["noShowCount"] == 1, first["status"])
    propose_slots(admin, application_id)
    choose_first_slot(t)
    move(application_id, -15)
    second = call("POST", path, token=admin)
    s = status_of(t)
    check("Vắng lần 2 → đóng đợt CLOSED, hồ sơ REJECTED, chờ 15 ngày", second["status"] == "CLOSED" and profile_status(m) == "REJECTED"
          and s["reason"] == "COOLDOWN" and s["retryAfter"], second["status"])

    r, riv = passed_mentor("reject", admin)
    propose_slots(admin, riv["applicationId"])
    choose_first_slot(r["accessToken"])
    low = {k: 4 for k in GOOD_ROUND2_SCORES}
    done = round2_decision(admin, riv["applicationId"], "REJECT", low)
    rs = status_of(r["accessToken"])
    check("REJECT sau vòng 2 → đợt REJECTED, chờ 15 ngày, hồ sơ REJECTED", done["status"] == "REJECTED" and rs["reason"] == "COOLDOWN"
          and profile_status(r) == "REJECTED", done["status"])
    status, _ = error_of(lambda: round2_decision(r["accessToken"], riv["applicationId"], "APPROVE", GOOD_ROUND2_SCORES, "mentor tự duyệt"))
    check("Mentor không kết luận được → 403", status == 403, status)


def token_endpoint():
    print("Endpoint nội bộ cấp token phòng (mentoring-service)")
    body = {"room": "mentorhub-verify-" + uuid.uuid4().hex, "userId": str(uuid.uuid4()), "name": "E2E", "moderator": False,
            "notBefore": "2026-01-01T00:00:00Z", "expiresAt": "2099-01-01T00:00:00Z"}
    status, _ = error_of(lambda: call("POST", f"{MENTORING}/internal/rooms/token", body))
    check("Thiếu X-Internal-Token → 403", status in (401, 403), status)
    ok = call("POST", f"{MENTORING}/internal/rooms/token", body, internal=True)
    check("Có token nội bộ → JWT cho đúng phòng", ok["provider"] == "jitsi" and claims(ok["jwt"])["room"] == body["room"])
    status, err = error_of(lambda: call("POST", f"{MENTORING}/internal/rooms/token", {**body, "room": "mentorhub-" + uuid.uuid4().hex}, internal=True))
    check("Không cấp token cho phòng học của mentee (sai mẫu tên phòng) → 400", status == 400, (status, err))


def main():
    t0 = time.time()
    print(f"E2E verification round 2 run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    token_endpoint()
    print("Đề xuất giờ, chọn giờ, phòng Jitsi, phiếu chấm, APPROVE")
    m, iv = slots_and_choice(admin)
    room_and_decision(admin, m, iv)
    print("Đổi giờ (D9)")
    reschedule_rules(admin)
    print("Mentor vắng hai lần, REJECT")
    absence_and_reject(admin)
    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
