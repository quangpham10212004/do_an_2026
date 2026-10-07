#!/usr/bin/env python3
"""
E2E Sprint 2 — mentoring-service + payment-service: US-13 thanh toán (phí, Idempotency-Key, refunds, hold),
US-12 xác nhận tham dự, US-14 form yêu cầu mentoring, US-15 yêu cầu hết hạn.

Chạy khi hệ thống đang chạy (docker compose up, profile khác prod) — mỗi lần tạo người dùng mới nên chạy lặp được:

    python3 scripts/e2e_s2_mentoring.py [US-13 US-12 US-14 US-15]

Để không phải chờ thật, script dùng endpoint dev của mentoring-service (X-Internal-Token, không tồn tại ở profile
prod): POST /internal/dev/sessions/{id}/shift, /internal/dev/requests/{id}/shift, /internal/dev/jobs/{job}.
Hold/release đi qua outbox — script kích hoạt flush qua /internal/dev/jobs/payment-outbox.
"""
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AI, AUTH, MENTORING, PAYMENT, PROFILE, ApiError, call, charge

VN = timezone(timedelta(hours=7))
RUN = uuid.uuid4().hex[:6]
AGENDA = "Review kien truc REST API va cach to chuc service layer"
GOAL = ("Tro thanh backend developer Java trong 6 thang, nam vung Spring Boot, thiet ke REST API "
        "va trien khai microservices voi Docker.")
CARD = {"cardNumber": "4242 4242 4242 4242", "expiry": (datetime.now() + timedelta(days=800)).strftime("%m/%y"), "cvv": "123"}
results = []


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def error_code(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error", {}).get("code") if isinstance(e.body, dict) else e.body)
    return 200, None


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"s2.{role.lower()}.{name}.{RUN}@test.local",
                                                       "password": "Passw0rd!", "role": role, "fullName": f"S2 {name}"})


def at(days, hour, minute=0):
    return (datetime.now(VN) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)


def approved_mentor(admin_token, name, hourly_rate, capacity=5):
    m = register("MENTOR", name)
    t = m["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"S2 Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot"],
        "bio": "Backend engineer nhieu nam kinh nghiem, huong dan junior xay dung REST API va microservices.",
        "yearsExperience": 6, "hourlyRate": hourly_rate, "capacity": capacity, "isAvailable": True, "portfolioLinks": []}, token=t)
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}/availability", {
        "slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=t)
    interview = call("POST", f"{AI}/api/ai/interviews", token=t)
    answer = ("Toi dung Redis cache-aside voi TTL, invalidation khi ghi; trade-off consistency va hieu nang; index, "
              "transaction, REST API versioning, pagination, idempotent. Vi du cu the o production.")
    while interview["status"] == "IN_PROGRESS":
        interview = call("POST", f"{AI}/api/ai/interviews/{interview['id']}/answers", {"answer": answer}, token=t)
    call("POST", f"{AI}/api/ai/admin/interviews/{interview['id']}/review", {"decision": "APPROVE", "note": "ok"}, token=admin_token)
    return m


def mentee_with_profile(name):
    me = register("MENTEE", name)
    call("PUT", f"{PROFILE}/api/profile/mentee/{me['userId']}", {
        "displayName": f"S2 Mentee {name} {RUN}", "goal": GOAL, "domain": "backend", "currentLevel": "BEGINNER",
        "skills": ["Java"], "portfolioLinks": []}, token=me["accessToken"])
    return me


def send_request(mentee, mentor, **extra):
    body = {"mentorId": mentor["userId"], "goal": GOAL, "sessionType": "CAREER_ADVICE", "frequency": "WEEKLY",
            "expectedDurationMonths": 3, "message": "Xin chao"}
    body.update(extra)
    return call("POST", f"{MENTORING}/api/mentoring/requests", body, token=mentee["accessToken"])


def accepted_mentee(mentor, name):
    me = mentee_with_profile(name)
    req = send_request(me, mentor)
    call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond", {"decision": "ACCEPT"}, token=mentor["accessToken"])
    return me


def book(mentee, mentor, start, duration=60):
    return call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(),
        "durationMinutes": duration, "sessionType": "CODE_REVIEW", "agenda": AGENDA}, token=mentee["accessToken"])


def txs(user, sid):
    return call("GET", f"{PAYMENT}/api/payment/sessions/{sid}/transactions", token=user["accessToken"])


def get_session(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}", token=user["accessToken"])


def dev(path, body=None):
    return call("POST", f"{MENTORING}/internal/dev/{path}", body or {}, internal=True)


def ended(sid, minutes_ago):
    """Dời giờ phiên để phiên đã kết thúc `minutes_ago` phút trước, rồi chạy job chuyển AWAITING_ATTENDANCE / giải quyết."""
    dev(f"sessions/{sid}/shift", {"endedMinutesAgo": minutes_ago})
    dev("jobs/attendance")


def attend(user, sid, answer):
    return call("POST", f"{MENTORING}/api/mentoring/sessions/{sid}/attendance", {"answer": answer}, token=user["accessToken"])


def us13(ctx):
    print("US-13 — Thanh toán: phí nền tảng, Idempotency-Key, hoàn tiền")
    mentor, mentee = ctx["mentor"], ctx["mentee"]
    s = book(mentee, mentor, at(8, 9), duration=90)
    check("US-13", "Phiên 90 phút × 200.000đ/giờ = 300.000đ", float(s["price"]) == 300000, s["price"])
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/api/payment/charge", {"sessionId": s["id"], "card": CARD},
                                           token=mentee["accessToken"]))
    check("US-13", "Thiếu Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUIRED", status == 400 and code == "IDEMPOTENCY_KEY_REQUIRED",
          (status, code))
    key = str(uuid.uuid4())
    t1 = charge(s["id"], CARD, mentee["accessToken"], idempotency_key=key)
    check("US-13", "300.000đ → fee = 45.000, mentorEarning = 255.000 (AC)",
          t1["status"] == "SUCCESS" and float(t1["fee"]) == 45000 and float(t1["mentorEarning"]) == 255000
          and abs(float(t1["feeRate"]) - 0.15) < 1e-9, t1)
    t2 = charge(s["id"], CARD, mentee["accessToken"], idempotency_key=key)
    all_tx = txs(mentee, s["id"])
    check("US-13", "2 lần charge cùng Idempotency-Key → 1 giao dịch, lần 2 trả kết quả lần 1 (AC)",
          t2["id"] == t1["id"] and len(all_tx) == 1, (t2["id"], len(all_tx)))
    other = book(mentee, mentor, at(9, 9))
    status, code = error_code(lambda: charge(other["id"], CARD, mentee["accessToken"], idempotency_key=key))
    check("US-13", "Dùng lại key cho phiên khác → 409 IDEMPOTENCY_KEY_REUSED", status == 409 and code == "IDEMPOTENCY_KEY_REUSED",
          (status, code))
    status, code = error_code(lambda: charge(s["id"], CARD, mentee["accessToken"]))
    check("US-13", "Key mới cho phiên đã trả → 409 (phiên đã CONFIRMED / ALREADY_PAID), không charge lần 2",
          status == 409 and code in ("SESSION_NOT_PAYABLE", "ALREADY_PAID") and len(txs(mentee, s["id"])) == 1, (status, code))
    check("US-13", "Mentor thấy fee/mentorEarning trong giao dịch của mình",
          any(t["id"] == t1["id"] and float(t["mentorEarning"]) == 255000
              for t in call("GET", f"{PAYMENT}/api/payment/transactions", token=mentor["accessToken"])))

    # Mentee huỷ < 72h phiên 300.000đ → không có dòng refund (AC)
    late = book(mentee, mentor, at(2, 15), duration=90)
    charge(late["id"], CARD, mentee["accessToken"])
    c = call("POST", f"{MENTORING}/api/mentoring/sessions/{late['id']}/cancel", {"reason": "Ban"}, token=mentee["accessToken"])
    t = txs(mentee, late["id"])[0]
    check("US-13", "Mentee huỷ < 72h phiên 300.000đ → không tạo dòng refund, giao dịch vẫn SUCCESS (AC)",
          c["refundPercent"] == 0 and t["status"] == "SUCCESS" and t["refunds"] == [] and float(t["refundedAmount"]) == 0, t)

    # Hoàn một phần qua endpoint nội bộ (percent / amount), tổng ≤ giá
    part = book(mentee, mentor, at(10, 9), duration=90)
    charge(part["id"], CARD, mentee["accessToken"])
    r1 = call("POST", f"{PAYMENT}/internal/payments/refund", {"sessionId": part["id"], "reason": "TEST", "percent": 50}, internal=True)
    check("US-13", "Hoàn 50% → PARTIALLY_REFUNDED, 1 dòng refund 150.000, fee/amount giữ nguyên",
          r1["status"] == "PARTIALLY_REFUNDED" and len(r1["refunds"]) == 1 and float(r1["refundedAmount"]) == 150000
          and float(r1["amount"]) == 300000 and float(r1["fee"]) == 45000 and r1["failureReason"] is None, r1)
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/internal/payments/refund",
                                           {"sessionId": part["id"], "amount": 150001}, internal=True))
    check("US-13", "Tổng hoàn vượt giá → 409 REFUND_EXCEEDS_AMOUNT", status == 409 and code == "REFUND_EXCEEDS_AMOUNT", (status, code))
    r2 = call("POST", f"{PAYMENT}/internal/payments/refund", {"sessionId": part["id"], "amount": 150000}, internal=True)
    check("US-13", "Hoàn nốt 150.000 → REFUNDED, 2 dòng refund", r2["status"] == "REFUNDED" and len(r2["refunds"]) == 2, r2)

    # Hold / release
    h = book(mentee, mentor, at(11, 9))
    charge(h["id"], CARD, mentee["accessToken"])
    held = call("POST", f"{PAYMENT}/internal/payments/hold", {"sessionId": h["id"], "reason": "SESSION_DISPUTED"}, internal=True)
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/internal/payments/refund", {"sessionId": h["id"]}, internal=True))
    released = call("POST", f"{PAYMENT}/internal/payments/release", {"sessionId": h["id"]}, internal=True)
    check("US-13", "SUCCESS → ON_HOLD (không hoàn được: 409 TRANSACTION_ON_HOLD) → SUCCESS",
          held["status"] == "ON_HOLD" and code == "TRANSACTION_ON_HOLD" and released["status"] == "SUCCESS", (held["status"], code))

    early = book(mentee, mentor, at(12, 9))
    charge(early["id"], CARD, mentee["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/sessions/{early['id']}/cancel", token=mentee["accessToken"])
    t = txs(mentee, early["id"])[0]
    check("US-13", "Mentee huỷ ≥ 72h → REFUNDED kèm 1 dòng refund toàn phần",
          t["status"] == "REFUNDED" and len(t["refunds"]) == 1 and float(t["refunds"][0]["amount"]) == float(t["amount"]), t)


def paid_session(ctx, day):
    s = book(ctx["mentee"], ctx["mentor"], at(day, 9), duration=90)
    charge(s["id"], CARD, ctx["mentee"]["accessToken"])
    return s


def us12(ctx):
    print("US-12 — Xác nhận tham dự sau phiên")
    mentor, mentee = ctx["mentor"], ctx["mentee"]

    # Trước giờ kết thúc: chưa xác nhận được; không tự báo mình vắng mặt
    s = paid_session(ctx, 20)
    status, code = error_code(lambda: attend(mentee, s["id"], "HELD"))
    check("US-12", "Trước giờ kết thúc → 409 ATTENDANCE_NOT_OPEN", status == 409 and code == "ATTENDANCE_NOT_OPEN", (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/complete", token=mentor["accessToken"]))
    check("US-12", "Mentor 'Đánh dấu hoàn thành' trước giờ kết thúc → 409 (không còn hoàn thành sớm)", status == 409, (status, code))
    ended(s["id"], 5)
    check("US-12", "Tới giờ kết thúc: CONFIRMED → AWAITING_ATTENDANCE", get_session(mentee, s["id"])["status"] == "AWAITING_ATTENDANCE")
    status, code = error_code(lambda: attend(mentee, s["id"], "MENTEE_NO_SHOW"))
    check("US-12", "Mentee tự báo mình vắng → 400 INVALID_ATTENDANCE_ANSWER", status == 400 and code == "INVALID_ATTENDANCE_ANSWER",
          (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/review", {"rating": 5},
                                           token=mentee["accessToken"]))
    check("US-12", "Chưa COMPLETED thì chưa đánh giá được (409)", status == 409, (status, code))
    one = attend(mentee, s["id"], "HELD")
    check("US-12", "Một bên HELD → vẫn chờ bên kia", one["status"] == "AWAITING_ATTENDANCE" and one["menteeAttendance"] == "HELD", one)
    status, code = error_code(lambda: attend(mentee, s["id"], "HELD"))
    check("US-12", "Mỗi bên chỉ trả lời 1 lần (409 ATTENDANCE_ALREADY_ANSWERED)", code == "ATTENDANCE_ALREADY_ANSWERED", (status, code))
    done = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/complete", token=mentor["accessToken"])
    check("US-12", "Mentor 'complete' = HELD → cả hai HELD → COMPLETED", done["status"] == "COMPLETED"
          and done["mentorAttendance"] == "HELD" and done["attendanceResolution"] == "BOTH_HELD", done)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/review", {"rating": 5}, token=mentee["accessToken"])
    check("US-12", "Phiên COMPLETED đánh giá được", get_session(mentee, s["id"])["reviewed"])

    # AC: không ai trả lời → COMPLETED sau 48 giờ
    s = paid_session(ctx, 21)
    dev(f"sessions/{s['id']}/shift", {"endedMinutesAgo": 47 * 60})
    dev("jobs/attendance")
    check("US-12", "Sau 47 giờ chưa ai trả lời → vẫn AWAITING_ATTENDANCE", get_session(mentee, s["id"])["status"] == "AWAITING_ATTENDANCE")
    ended(s["id"], 48 * 60 + 1)
    v = get_session(mentee, s["id"])
    t = txs(mentee, s["id"])[0]
    check("US-12", "Không ai trả lời → COMPLETED 48 giờ sau giờ kết thúc, mentor được trả (giao dịch SUCCESS) (AC)",
          v["status"] == "COMPLETED" and v["attendanceResolution"] == "NO_ANSWER" and t["status"] == "SUCCESS", (v["status"], t["status"]))

    # AC: trả lời mâu thuẫn → DISPUTED ngay, giao dịch ON_HOLD, không hoàn/không trả
    s = paid_session(ctx, 22)
    ended(s["id"], 5)
    attend(mentee, s["id"], "HELD")
    v = attend(mentor, s["id"], "MENTEE_NO_SHOW")
    t = txs(mentee, s["id"])[0]
    if t["status"] != "ON_HOLD":   # outbox gửi ngay sau commit; lỗi tạm thời → job gửi lại
        dev("jobs/payment-outbox")
        t = txs(mentee, s["id"])[0]
    check("US-12", "Trả lời mâu thuẫn → DISPUTED ngay; giao dịch ON_HOLD, không có refund (AC)",
          v["status"] == "DISPUTED" and t["status"] == "ON_HOLD" and t["refunds"] == [], (v["status"], t["status"], t["refunds"]))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/review", {"rating": 1},
                                           token=mentee["accessToken"]))
    check("US-12", "Phiên DISPUTED không đánh giá được", status == 409, (status, code))
    admin_notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=100", token=ctx["admin"]["accessToken"])["items"]
    check("US-12", "Admin nhận thông báo SESSION_DISPUTED (hook US-32)",
          any(n["type"] == "SESSION_DISPUTED" and s["id"] in n["message"] for n in admin_notes))

    # Mentee báo mentor vắng, mentor im lặng 48 giờ → NO_SHOW_MENTOR, hoàn 100% + strike
    s = paid_session(ctx, 23)
    ended(s["id"], 5)
    attend(mentee, s["id"], "MENTOR_NO_SHOW")
    ended(s["id"], 48 * 60 + 1)
    v = get_session(mentee, s["id"])
    t = txs(mentee, s["id"])[0]
    if t["status"] != "REFUNDED":
        dev("jobs/payment-outbox")
        t = txs(mentee, s["id"])[0]
    strikes = [n for n in call("GET", f"{MENTORING}/api/mentoring/notifications?limit=50", token=mentor["accessToken"])["items"]
               if n["type"] == "MENTOR_STRIKE" and "vắng mặt" in n["message"]]
    check("US-12", "Mentee báo mentor vắng + mentor im lặng → NO_SHOW_MENTOR, giao dịch REFUNDED 100%, mentor bị strike",
          v["status"] == "NO_SHOW_MENTOR" and v["refundPercent"] == 100 and t["status"] == "REFUNDED"
          and float(t["refundedAmount"]) == float(t["amount"]) and len(strikes) >= 1, (v["status"], t["status"], len(strikes)))

    # Mentor báo mentee vắng, mentee im lặng → NO_SHOW_MENTEE, không hoàn
    s = paid_session(ctx, 24)
    ended(s["id"], 5)
    attend(mentor, s["id"], "MENTEE_NO_SHOW")
    ended(s["id"], 48 * 60 + 1)
    v = get_session(mentee, s["id"])
    t = txs(mentee, s["id"])[0]
    check("US-12", "Mentor báo mentee vắng + mentee im lặng → NO_SHOW_MENTEE, không hoàn (SUCCESS)",
          v["status"] == "NO_SHOW_MENTEE" and t["status"] == "SUCCESS" and t["refunds"] == [], (v["status"], t["status"]))

    # Cả hai báo huỷ trong buổi gọi → CANCELLED, hoàn 100%, không strike
    s = paid_session(ctx, 25)
    ended(s["id"], 5)
    attend(mentee, s["id"], "CANCELLED_ON_CALL")
    v = attend(mentor, s["id"], "CANCELLED_ON_CALL")
    t = txs(mentee, s["id"])[0]
    if t["status"] != "REFUNDED":
        dev("jobs/payment-outbox")
        t = txs(mentee, s["id"])[0]
    check("US-12", "Cả hai CANCELLED_ON_CALL → CANCELLED (cancelReason CANCELLED_ON_CALL), hoàn 100%",
          v["status"] == "CANCELLED" and v["cancelReason"] == "CANCELLED_ON_CALL" and t["status"] == "REFUNDED", (v["status"], t["status"]))
    status, code = error_code(lambda: attend(mentee, s["id"], "HELD"))
    check("US-12", "Phiên đã kết luận không trả lời thêm được (409 ATTENDANCE_CLOSED)", code in ("ATTENDANCE_CLOSED", "ATTENDANCE_ALREADY_ANSWERED"),
          (status, code))


def us14(ctx):
    print("US-14 — Form yêu cầu mentoring")
    admin = ctx["admin"]["accessToken"]
    m1, m2, m3, m4 = (approved_mentor(admin, f"req{i}", 150000) for i in range(1, 5))
    ctx["extra_mentors"] = [m1, m2, m3, m4]
    me = mentee_with_profile("req")
    status, code = error_code(lambda: send_request(me, m1, goal="Hoc Java"))
    check("US-14", "Goal < 50 ký tự → 400 INVALID_GOAL", status == 400 and code == "INVALID_GOAL", (status, code))
    status, code = error_code(lambda: send_request(me, m1, expectedDurationMonths=2))
    check("US-14", "expectedDurationMonths ngoài 1/3/6 → 400", status == 400 and code == "INVALID_EXPECTED_DURATION", (status, code))
    status, code = error_code(lambda: send_request(me, m1, frequency="DAILY"))
    check("US-14", "frequency ngoài WEEKLY/BIWEEKLY/MONTHLY/ONE_OFF → 400", status == 400, (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": m1["userId"], "message": "Xin chao"},
                                           token=me["accessToken"]))
    check("US-14", "Request dạng cũ (chỉ lời nhắn) → 400 VALIDATION_ERROR", status == 400, (status, code))
    r1 = send_request(me, m1, sessionType="CODE_REVIEW", frequency="BIWEEKLY", expectedDurationMonths=6, message="Chao anh")
    check("US-14", "Lưu goal / sessionType / frequency / expectedDurationMonths / message",
          r1["goal"] == GOAL and r1["sessionType"] == "CODE_REVIEW" and r1["frequency"] == "BIWEEKLY"
          and r1["expectedDurationMonths"] == 6 and r1["message"] == "Chao anh" and r1["status"] == "PENDING", r1)
    status, code = error_code(lambda: send_request(me, m1))
    check("US-14", "Vẫn 1 yêu cầu đang mở với mỗi mentor (409 REQUEST_ALREADY_EXISTS)", code == "REQUEST_ALREADY_EXISTS", (status, code))
    send_request(me, m2)
    r3 = send_request(me, m3)
    status, code = error_code(lambda: send_request(me, m4))
    check("US-14", "Yêu cầu PENDING thứ 4 → 409 TOO_MANY_PENDING_REQUESTS", status == 409 and code == "TOO_MANY_PENDING_REQUESTS", (status, code))
    call("POST", f"{MENTORING}/api/mentoring/requests/{r3['id']}/cancel", token=me["accessToken"])
    r4 = send_request(me, m4)
    check("US-14", "Huỷ bớt 1 yêu cầu → gửi được yêu cầu mới", r4["status"] == "PENDING")

    seen = next(r for r in call("GET", f"{MENTORING}/api/mentoring/requests", token=m1["accessToken"]) if r["id"] == r1["id"])
    check("US-14", "Mentor thấy tóm tắt hồ sơ mentee (domain, trình độ, kỹ năng) kèm goal của yêu cầu",
          seen["menteeProfile"] is not None and seen["menteeProfile"]["currentLevel"] == "BEGINNER"
          and seen["menteeProfile"]["domain"] == "backend" and seen["goal"] == GOAL, seen.get("menteeProfile"))
    mine = call("GET", f"{MENTORING}/api/mentoring/requests", token=me["accessToken"])
    check("US-14", "Mentee xem danh sách của mình không kèm menteeProfile", all(r["menteeProfile"] is None for r in mine))

    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/respond", {"decision": "REJECT"},
                                           token=m1["accessToken"]))
    check("US-14", "Từ chối không kèm lý do → 400 REJECT_REASON_REQUIRED", status == 400 and code == "REJECT_REASON_REQUIRED", (status, code))
    rej = call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/respond",
               {"decision": "REJECT", "rejectReason": "NOT_MY_EXPERTISE", "note": "Ban nen tim mentor frontend"}, token=m1["accessToken"])
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=20", token=me["accessToken"])["items"]
    check("US-14", "Từ chối lưu rejectReason + note; mentee được báo kèm lý do tiếng Việt",
          rej["status"] == "REJECTED" and rej["rejectReason"] == "NOT_MY_EXPERTISE" and rej["responseNote"] == "Ban nen tim mentor frontend"
          and any(n["type"] == "REQUEST_REJECTED" and "chuyên môn" in n["message"] for n in notes), rej)
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/respond",
                                           {"decision": "REJECT", "rejectReason": "BUSY"}, token=m1["accessToken"]))
    check("US-14", "rejectReason ngoài FULL/NOT_MY_EXPERTISE/SCHEDULE/OTHER → 400", status == 400, (status, code))


STORIES = {"US-13": us13, "US-12": us12, "US-14": us14}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 2 mentoring/payment run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = approved_mentor(admin["accessToken"], "main", 200000)
    ctx = {"admin": admin, "mentor": mentor, "mentee": accepted_mentee(mentor, "main")}
    for story, fn in STORIES.items():
        if not selected or story in selected:
            fn(ctx)
            print()

    passed = sum(1 for r in results if r[2])
    print(f"{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    for story, name, ok, detail in results:
        if not ok:
            print(f"  FAIL {story}: {name} {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main(set(sys.argv[1:])))
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
