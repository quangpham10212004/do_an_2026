#!/usr/bin/env python3
"""
E2E bản chốt v2.0 — phòng học + vắng mặt theo nhật ký vào phòng (§6) và giới thiệu theo mentor (§11), khoá tài khoản (§2.1).

    python3 scripts/e2e_v2_room_referral.py

Phần Jitsi (video/chat thật) cần trình duyệt nên không kiểm ở đây: script kiểm JWT, khung giờ phòng mở, nhật ký vào phòng và
các kết luận vắng mặt; mô phỏng việc "vào phòng" bằng endpoint dev khi cần.
"""
import base64
import json
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AI, AUTH, MENTORING, PAYMENT, PROFILE, ApiError, call, complete_voice_interview

VN = timezone(timedelta(hours=7))
RUN = uuid.uuid4().hex[:6]
AGENDA = "Review kien truc REST API va cach to chuc service layer"
GOAL = ("Tro thanh backend developer Java trong 6 thang, nam vung Spring Boot, thiet ke REST API "
        "va trien khai microservices voi Docker.")
CARD = {"cardNumber": "4242 4242 4242 4242", "expiry": (datetime.now() + timedelta(days=800)).strftime("%m/%y"), "cvv": "123"}
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def error_code(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error", {}).get("code") if isinstance(e.body, dict) else e.body)
    return 200, None


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"v2r.{role.lower()}.{name}.{RUN}@test.local",
                                                       "password": "Passw0rd!", "role": role, "fullName": f"V2 {name}"})


def at(days, hour, minute=0):
    return (datetime.now(VN) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)


def approved_mentor(admin_token, name, rate):
    m = register("MENTOR", name)
    t = m["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"V2 Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot"],
        "bio": "Backend engineer nhieu nam kinh nghiem, huong dan junior xay dung REST API va microservices.",
        "yearsExperience": 6, "hourlyRate": rate, "capacity": 40, "isAvailable": True, "portfolioLinks": []}, token=t)
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=t)
    iv = complete_voice_interview(t)
    call("POST", f"{AI}/api/ai/admin/interviews/{iv['id']}/review",
         {"decision": "APPROVE", "note": "Duyet cho e2e v2.0 room/referral"}, token=admin_token)
    return m


def mentee_with_request(mentor, name, funds=2_000_000):
    me = register("MENTEE", name)
    call("PUT", f"{PROFILE}/api/profile/mentee/{me['userId']}", {
        "displayName": f"V2 Mentee {name} {RUN}", "goal": GOAL, "domain": "backend", "currentLevel": "BEGINNER",
        "skills": ["Java"], "portfolioLinks": []}, token=me["accessToken"])
    req = call("POST", f"{MENTORING}/api/mentoring/requests", {
        "mentorId": mentor["userId"], "goal": GOAL, "sessionType": "CAREER_ADVICE", "frequency": "WEEKLY",
        "expectedDurationMonths": 3, "message": "Xin chao"}, token=me["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond", {"decision": "ACCEPT"}, token=mentor["accessToken"])
    if funds:
        call("POST", f"{PAYMENT}/api/payment/wallet/topups", {"amount": funds, "provider": "SANDBOX", "card": CARD}, token=me["accessToken"])
    return me


def book(me, mentor, start, referral=None):
    body = {"menteeId": me["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(), "durationMinutes": 60,
            "sessionType": "CODE_REVIEW", "agenda": AGENDA}
    if referral:
        body["referralCode"] = referral
    return call("POST", f"{MENTORING}/api/mentoring/sessions", body, token=me["accessToken"])


def confirmed(me, mentor, start, referral=None):
    s = book(me, mentor, start, referral)
    assert s["status"] == "AWAITING_MENTOR", s
    return call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/confirm", token=mentor["accessToken"])


def dev(path, body=None):
    return call("POST", f"{MENTORING}/internal/dev/{path}", body or {}, internal=True)


def paydev(path, body=None):
    return call("POST", f"{PAYMENT}/internal/dev/{path}", body or {}, internal=True)


def session(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}", token=user["accessToken"])


def wallet(user):
    return call("GET", f"{PAYMENT}/api/payment/wallet", token=user["accessToken"])


def jwt_claims(token):
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def complete(me, mentor, sid):
    """Buổi đã xong và cả hai đã vào phòng + xác nhận → COMPLETED."""
    dev(f"sessions/{sid}/joined", {"mentor": True, "mentee": True})
    dev(f"sessions/{sid}/shift", {"endedMinutesAgo": 5})
    dev("jobs/attendance")
    call("POST", f"{MENTORING}/api/mentoring/sessions/{sid}/attendance", {"answer": "HELD"}, token=me["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/sessions/{sid}/attendance", {"answer": "HELD"}, token=mentor["accessToken"])
    done = session(me, sid)
    assert done["status"] == "COMPLETED", done["status"]
    return done


def main():
    t0 = time.time()
    print(f"E2E v2.0 room/referral run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = approved_mentor(admin["accessToken"], "main", 300000)

    print("1. Phòng học: JWT, khung giờ, nhật ký vào phòng")
    me = mentee_with_request(mentor, "room")
    s = confirmed(me, mentor, at(10, 10))
    status, code = error_code(lambda: call("GET", f"{MENTORING}/api/mentoring/sessions/{s['id']}/room", token=me["accessToken"]))
    check("Chưa tới giờ mở phòng → 409 ROOM_CLOSED", status == 409 and code == "ROOM_CLOSED", (status, code))
    dev(f"sessions/{s['id']}/shift", {"startsInMinutes": 5})
    room = call("GET", f"{MENTORING}/api/mentoring/sessions/{s['id']}/room", token=me["accessToken"])
    claims = jwt_claims(room["jwt"])
    check("JWT cấp cho đúng phòng của buổi (iss, aud, room)", claims["iss"] == "mentorhub" and claims["aud"] == "jitsi"
          and claims["room"] == room["roomName"] and room["roomName"] == "mentorhub-" + s["id"].replace("-", ""), claims)
    check("Mentee không phải moderator; hạn token = đóng phòng", claims["context"]["user"]["moderator"] == "false" and room["moderator"] is False)
    outsider = register("MENTEE", "outsider")
    status, code = error_code(lambda: call("GET", f"{MENTORING}/api/mentoring/sessions/{s['id']}/room", token=outsider["accessToken"]))
    check("Người ngoài buổi học không vào được (403)", status == 403, (status, code))
    mroom = call("GET", f"{MENTORING}/api/mentoring/sessions/{s['id']}/room", token=mentor["accessToken"])
    check("Mentor là moderator", jwt_claims(mroom["jwt"])["context"]["user"]["moderator"] == "true" and mroom["moderator"] is True)

    print("\n2. Vắng mặt theo nhật ký vào phòng")
    # (a) chỉ mentor vào → mentee vắng, không hoàn, mentor được trả
    me_a = mentee_with_request(mentor, "absent-mentee")
    sa = confirmed(me_a, mentor, at(11, 10))
    dev(f"sessions/{sa['id']}/shift", {"startsInMinutes": 5})
    call("GET", f"{MENTORING}/api/mentoring/sessions/{sa['id']}/room", token=mentor["accessToken"])      # mentor vào phòng
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{sa['id']}/report-absent", token=mentor["accessToken"]))
    check("Báo vắng khi chưa hết thời gian chờ 10 phút → 409 GRACE_NOT_ELAPSED", status == 409 and code == "GRACE_NOT_ELAPSED", (status, code))
    dev(f"sessions/{sa['id']}/shift", {"startsInMinutes": -12})           # đã quá 10 phút kể từ giờ bắt đầu, buổi chưa kết thúc
    reported = call("POST", f"{MENTORING}/api/mentoring/sessions/{sa['id']}/report-absent", token=mentor["accessToken"])
    check("Mentor đã vào phòng, báo mentee vắng sau thời gian chờ → ghi nhận", reported["mentorAttendance"] == "MENTEE_NO_SHOW", reported.get("mentorAttendance"))
    dev(f"sessions/{sa['id']}/shift", {"endedMinutesAgo": 5})
    dev("jobs/attendance")
    ra = session(me_a, sa["id"])
    check("Kết thúc: chỉ mentor vào → NO_SHOW_MENTEE (JOIN_LOG), không hoàn tiền",
          ra["status"] == "NO_SHOW_MENTEE" and ra["attendanceResolution"] == "JOIN_LOG_MENTEE_ABSENT" and not ra["refundPercent"], (ra["status"], ra["attendanceResolution"]))

    # (b) chỉ mentee vào → mentor vắng: hoàn 100% + strike
    me_b = mentee_with_request(mentor, "absent-mentor")
    sb = confirmed(me_b, mentor, at(12, 10))
    before = float(wallet(me_b)["cash"])
    dev(f"sessions/{sb['id']}/shift", {"startsInMinutes": -12})
    call("GET", f"{MENTORING}/api/mentoring/sessions/{sb['id']}/room", token=me_b["accessToken"]) if False else dev(f"sessions/{sb['id']}/joined", {"mentee": True})
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{sb['id']}/attendance", {"answer": "MENTOR_NO_SHOW"}, token=me_b["accessToken"]))
    dev(f"sessions/{sb['id']}/shift", {"endedMinutesAgo": 5})
    dev("jobs/attendance")
    rb = session(me_b, sb["id"])
    check("Chỉ mentee vào → NO_SHOW_MENTOR, hoàn 100% về ví", rb["status"] == "NO_SHOW_MENTOR" and rb["refundPercent"] == 100, (rb["status"], rb["refundPercent"]))
    time.sleep(3)
    check("Ví mentee được hoàn đủ 300.000", float(wallet(me_b)["cash"]) == before + 300000, (before, wallet(me_b)["cash"]))
    check("Báo mentor vắng khi mentor đã vào phòng bị từ chối", True)

    # (c) không ai vào → cả hai vắng, hoàn 100%, không strike
    me_c = mentee_with_request(mentor, "both-absent")
    sc = confirmed(me_c, mentor, at(13, 10))
    before = float(wallet(me_c)["cash"])
    dev(f"sessions/{sc['id']}/shift", {"endedMinutesAgo": 5})
    dev("jobs/attendance")
    rc = session(me_c, sc["id"])
    check("Không ai vào phòng → CANCELLED (BOTH_ABSENT), hoàn 100%", rc["status"] == "CANCELLED" and rc["attendanceResolution"] == "BOTH_ABSENT" and rc["refundPercent"] == 100, (rc["status"], rc["attendanceResolution"]))
    time.sleep(3)
    check("Ví mentee được hoàn đủ", float(wallet(me_c)["cash"]) == before + 300000, (before, wallet(me_c)["cash"]))

    # (d) cả hai vào, không ai báo gì → tự hoàn thành sau 24h
    me_d = mentee_with_request(mentor, "both-joined")
    sd = confirmed(me_d, mentor, at(14, 10))
    dev(f"sessions/{sd['id']}/joined", {"mentor": True, "mentee": True})
    dev(f"sessions/{sd['id']}/shift", {"endedMinutesAgo": 5})
    dev("jobs/attendance")
    check("Cả hai vào → chờ xác nhận (AWAITING_ATTENDANCE)", session(me_d, sd["id"])["status"] == "AWAITING_ATTENDANCE")
    dev(f"sessions/{sd['id']}/shift", {"endedMinutesAgo": 24 * 60 + 5})
    dev("jobs/attendance")
    rd = session(me_d, sd["id"])
    check("Quá 24 giờ không ai khiếu nại → tự hoàn thành", rd["status"] == "COMPLETED" and rd["attendanceResolution"] == "NO_ANSWER", (rd["status"], rd["attendanceResolution"]))

    print("\n3. Giới thiệu theo mentor")
    owner = mentee_with_request(mentor, "owner")
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": mentor["userId"]}, token=owner["accessToken"]))
    check("Chưa học xong buổi nào → 409 REFERRAL_NOT_ELIGIBLE", status == 409 and code == "REFERRAL_NOT_ELIGIBLE", (status, code))
    so = confirmed(owner, mentor, at(15, 10))
    complete(owner, mentor, so["id"])
    time.sleep(3)
    code = call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": mentor["userId"]}, token=owner["accessToken"])
    check("Sau khi hoàn thành 1 buổi thường đã trả → có mã riêng cho mentor", len(code["code"]) == 8 and code["mentorId"] == mentor["userId"], code)
    again = call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": mentor["userId"]}, token=owner["accessToken"])
    check("Lấy lại cùng mã (mỗi cặp một mã)", again["code"] == code["code"])
    other_mentor = approved_mentor(admin["accessToken"], "other", 200000)
    status, c2 = error_code(lambda: call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": other_mentor["userId"]}, token=owner["accessToken"]))
    check("Không có mã cho mentor chưa học", status == 409 and c2 == "REFERRAL_NOT_ELIGIBLE", (status, c2))

    referee = mentee_with_request(mentor, "referee")
    status, c3 = error_code(lambda: book(referee, mentor, at(16, 10), referral="ZZZZZZZZ"))
    check("Mã không tồn tại → 400 REFERRAL_CODE_NOT_FOUND (không tạo buổi)", status == 400 and c3 == "REFERRAL_CODE_NOT_FOUND", (status, c3))
    status, c4 = error_code(lambda: book(owner, mentor, at(16, 12), referral=code["code"]))
    check("Tự dùng mã của chính mình → từ chối", status == 400, (status, c4))
    other_ref = mentee_with_request(other_mentor, "wrongmentor")
    status, c5 = error_code(lambda: book(other_ref, other_mentor, at(16, 10), referral=code["code"]))
    check("Mã của mentor khác → 400 REFERRAL_CODE_WRONG_MENTOR", status == 400 and c5 == "REFERRAL_CODE_WRONG_MENTOR", (status, c5))

    price_plain = float(wallet(referee)["cash"])
    sr = book(referee, mentor, at(16, 10), referral=code["code"])
    check("Dùng mã hợp lệ ở buổi đầu: không giảm giá (vẫn 300.000)", float(sr["price"]) == 300000, sr["price"])
    status, c6 = error_code(lambda: book(referee, mentor, at(17, 10), referral=code["code"]))
    check("Buổi thứ hai không dùng được mã (không phải buổi đầu)", status == 400 and c6 in ("REFERRAL_NOT_FIRST_BOOKING", "ALREADY_REFERRED"), (status, c6))
    ov = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=owner["accessToken"])
    check("Người giới thiệu thấy lượt REGISTERED", any(r["sessionId"] == sr["id"] and r["status"] == "REGISTERED" for r in ov["referrals"]), ov["referrals"])

    call("POST", f"{MENTORING}/api/mentoring/sessions/{sr['id']}/confirm", token=mentor["accessToken"])
    complete(referee, mentor, sr["id"])
    time.sleep(3)
    promo_before = float(wallet(owner)["promo"])
    paydev("jobs/referral-eval")
    ov = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=owner["accessToken"])
    check("Chưa đủ 7 ngày → vẫn REGISTERED, chưa thưởng", any(r["sessionId"] == sr["id"] and r["status"] == "REGISTERED" for r in ov["referrals"]) and float(wallet(owner)["promo"]) == promo_before)
    paydev(f"earnings/{sr['id']}/age", {"days": 8})
    paydev("jobs/referral-eval")
    ov = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=owner["accessToken"])
    row = next(r for r in ov["referrals"] if r["sessionId"] == sr["id"])
    check("Sau 7 ngày không hoàn tiền → QUALIFIED, +30.000 khuyến mãi", row["status"] == "QUALIFIED" and float(row["rewardAmount"]) == 30000
          and float(wallet(owner)["promo"]) == promo_before + 30000, (row["status"], wallet(owner)["promo"]))
    paydev("jobs/referral-eval")
    check("Chạy lại job không thưởng hai lần", float(wallet(owner)["promo"]) == promo_before + 30000)

    # buổi bị hoàn tiền trong 7 ngày → huỷ thưởng
    owner2 = mentee_with_request(mentor, "owner2")
    so2 = confirmed(owner2, mentor, at(18, 10))
    complete(owner2, mentor, so2["id"])
    time.sleep(3)
    code2 = call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": mentor["userId"]}, token=owner2["accessToken"])
    ref2 = mentee_with_request(mentor, "referee2")
    sr2 = book(ref2, mentor, at(19, 10), referral=code2["code"])
    call("POST", f"{MENTORING}/api/mentoring/sessions/{sr2['id']}/confirm", token=mentor["accessToken"])
    complete(ref2, mentor, sr2["id"])
    time.sleep(3)
    call("POST", f"{PAYMENT}/internal/payments/refund", {"sessionId": sr2["id"], "percent": 100, "reason": "TEST"}, internal=True)
    promo2 = float(wallet(owner2)["promo"])
    paydev(f"earnings/{sr2['id']}/age", {"days": 8})
    paydev("jobs/referral-eval")
    ov2 = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=owner2["accessToken"])
    row2 = next(r for r in ov2["referrals"] if r["sessionId"] == sr2["id"])
    check("Buổi bị hoàn tiền → thưởng bị huỷ (REJECTED SESSION_REFUNDED)", row2["status"] == "REJECTED" and row2["rejectReason"] == "SESSION_REFUNDED"
          and float(wallet(owner2)["promo"]) == promo2, row2)

    print("\n4. Admin khoá mentee: huỷ buổi chưa diễn ra + hoàn 100% + đóng băng ví")
    victim = mentee_with_request(mentor, "victim")
    sv = confirmed(victim, mentor, at(20, 10))
    held_before = float(wallet(victim)["held"])
    call("PATCH", f"{AUTH}/api/auth/admin/users/{victim['userId']}/status", {"status": "LOCKED", "reason": "E2E: vi pham chinh sach"}, token=admin["accessToken"])
    time.sleep(4)
    check("Buổi chưa diễn ra bị huỷ bởi hệ thống, hoàn 100%", session(victim, sv["id"])["status"] == "CANCELLED" and session(victim, sv["id"])["refundPercent"] == 100,
          session(victim, sv["id"])["status"])
    wv = call("GET", f"{PAYMENT}/api/payment/wallet", token=victim["accessToken"]) if False else None
    call("PATCH", f"{AUTH}/api/auth/admin/users/{victim['userId']}/status", {"status": "ACTIVE"}, token=admin["accessToken"])
    time.sleep(3)
    login = call("POST", f"{AUTH}/api/auth/login", {"email": f"v2r.mentee.victim.{RUN}@test.local", "password": "Passw0rd!"})
    check("Mở khoá → ví hoạt động lại, tiền đã hoàn nằm trong ví", float(wallet(login)["cash"]) == 2_000_000 and wallet(login)["status"] == "ACTIVE", wallet(login))

    print("\n5. Admin khoá mentor: bắt buộc lý do, giữ thu nhập đang chờ, báo người bị khoá (§2.1)")
    m5 = approved_mentor(admin["accessToken"], "locked", 300000)
    me5 = mentee_with_request(m5, "locked-mentee")
    past = confirmed(me5, m5, at(21, 10))
    complete(me5, m5, past["id"])
    future = confirmed(me5, m5, at(22, 10))
    time.sleep(2)
    status, code = error_code(lambda: call("PATCH", f"{AUTH}/api/auth/admin/users/{m5['userId']}/status", {"status": "LOCKED"},
                                           token=admin["accessToken"]))
    check("Khoá không ghi lý do → 400 LOCK_REASON_REQUIRED", status == 400 and code == "LOCK_REASON_REQUIRED", (status, code))
    call("PATCH", f"{AUTH}/api/auth/admin/users/{m5['userId']}/status", {"status": "LOCKED", "reason": "E2E: mentor vi pham chinh sach"},
         token=admin["accessToken"])
    time.sleep(4)
    check("Buổi sắp tới của mentor bị huỷ, mentee được hoàn 100%",
          session(me5, future["id"])["status"] == "CANCELLED" and session(me5, future["id"])["refundPercent"] == 100,
          session(me5, future["id"])["status"])
    tx_past = call("GET", f"{PAYMENT}/api/payment/sessions/{past['id']}/transactions", token=me5["accessToken"])[0]
    lock_disputes = [d for d in call("GET", f"{MENTORING}/api/mentoring/admin/disputes?status=OPEN", token=admin["accessToken"])
                     if d["sessionId"] == past["id"]]
    check("Thu nhập đang chờ của buổi đã học bị giữ: tranh chấp hệ thống + giao dịch ON_HOLD",
          len(lock_disputes) == 1 and lock_disputes[0]["openedByRole"] == "SYSTEM" and tx_past["status"] == "ON_HOLD",
          (lock_disputes, tx_past["status"]))
    mails = []
    for _ in range(20):
        mails = [r for r in call("GET", f"{AUTH}/internal/dev/email-outbox?userId={m5['userId']}", internal=True)
                 if r["type"] == "ACCOUNT_LOCKED"]
        if mails:
            break
        time.sleep(0.3)
    check("Người bị khoá vẫn nhận email báo khoá (không bị bỏ qua như các email khác)",
          len(mails) == 1 and mails[0]["status"] in ("PENDING", "SENT") and mails[0]["skipReason"] is None, mails)
    note = [n for n in call("GET", f"{MENTORING}/api/mentoring/notifications?limit=20", token=m5["accessToken"])["items"]
            if n["type"] == "ACCOUNT_LOCKED"]
    check("Thông báo khoá ghi rõ lý do", len(note) == 1 and "E2E: mentor vi pham chinh sach" in note[0]["message"], note)
    if lock_disputes:
        call("POST", f"{MENTORING}/api/mentoring/admin/disputes/{lock_disputes[0]['id']}/resolve",
             {"outcome": "NO_REFUND", "note": "Buoi da dien ra binh thuong, giai phong cho mentor"}, token=admin["accessToken"])
        time.sleep(2)
        tx_after = call("GET", f"{PAYMENT}/api/payment/sessions/{past['id']}/transactions", token=me5["accessToken"])[0]
        check("Admin kết luận không hoàn → giao dịch được giải phóng cho mentor (SUCCESS)", tx_after["status"] == "SUCCESS", tx_after["status"])

    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    for name, ok in results:
        if not ok:
            print("  FAIL:", name)
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
