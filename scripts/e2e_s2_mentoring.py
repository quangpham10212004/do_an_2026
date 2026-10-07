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


STORIES = {"US-13": us13}


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
