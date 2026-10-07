#!/usr/bin/env python3
"""
E2E Sprint 3 — Team A (mentoring-service + payment-service): US-25 sổ thu nhập mentor, US-32 tranh chấp,
US-31 kết thúc mentoring, US-27 (phía mentoring) endpoint khoá mentor.

Chạy khi hệ thống đang chạy (docker compose up, profile khác prod) — mỗi lần tạo người dùng mới nên chạy lặp được:

    python3 scripts/e2e_s3_mentoring.py [US-25 US-32 US-31 US-27]

Để không phải chờ thật, script dùng endpoint dev (X-Internal-Token, không tồn tại ở profile prod):
- mentoring-service: POST /internal/dev/sessions/{id}/shift, /internal/dev/requests/{id}/inactivity,
  /internal/dev/jobs/{attendance|payment-outbox|inactivity}
- payment-service: POST /internal/dev/earnings/{sessionId}/due (đưa lịch giải phóng 48 giờ tới hạn ngay),
  /internal/dev/jobs/earning-release
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
DESC = "Mentor vao muon 30 phut va ket thuc som, khong dung agenda da thong nhat."
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
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"s3a.{role.lower()}.{name}.{RUN}@test.local",
                                                       "password": "Passw0rd!", "role": role, "fullName": f"S3 {name}"})


def at(days, hour, minute=0):
    return (datetime.now(VN) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)


def approved_mentor(admin_token, name, hourly_rate=200000, capacity=5):
    m = register("MENTOR", name)
    t = m["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"S3 Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot"],
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
        "displayName": f"S3 Mentee {name} {RUN}", "goal": GOAL, "domain": "backend", "currentLevel": "BEGINNER",
        "skills": ["Java"], "portfolioLinks": []}, token=me["accessToken"])
    return me


def send_request(mentee, mentor):
    return call("POST", f"{MENTORING}/api/mentoring/requests", {
        "mentorId": mentor["userId"], "goal": GOAL, "sessionType": "CAREER_ADVICE", "frequency": "WEEKLY",
        "expectedDurationMonths": 3, "message": "Xin chao"}, token=mentee["accessToken"])


def accepted_mentee(mentor, name):
    me = mentee_with_profile(name)
    req = send_request(me, mentor)
    call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond", {"decision": "ACCEPT"}, token=mentor["accessToken"])
    me["requestId"] = req["id"]
    return me


def book(mentee, mentor, start, duration=90):
    return call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(),
        "durationMinutes": duration, "sessionType": "CODE_REVIEW", "agenda": AGENDA}, token=mentee["accessToken"])


def paid(mentee, mentor, start, duration=90):
    s = book(mentee, mentor, start, duration)
    charge(s["id"], CARD, mentee["accessToken"])
    return s


def txs(user, sid):
    return call("GET", f"{PAYMENT}/api/payment/sessions/{sid}/transactions", token=user["accessToken"])


def get_session(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}", token=user["accessToken"])


def dev(path, body=None):
    return call("POST", f"{MENTORING}/internal/dev/{path}", body or {}, internal=True)


def pay_dev(path):
    return call("POST", f"{PAYMENT}/internal/dev/{path}", {}, internal=True)


def ended(sid, minutes_ago):
    dev(f"sessions/{sid}/shift", {"endedMinutesAgo": minutes_ago})
    dev("jobs/attendance")


def attend(user, sid, answer):
    return call("POST", f"{MENTORING}/api/mentoring/sessions/{sid}/attendance", {"answer": answer}, token=user["accessToken"])


def completed(mentee, mentor, sid):
    """Phiên vừa kết thúc 5 phút, hai bên HELD → COMPLETED (final-state gửi ngay qua outbox)."""
    ended(sid, 5)
    attend(mentee, sid, "HELD")
    attend(mentor, sid, "HELD")
    dev("jobs/payment-outbox")


def summary(mentor):
    return call("GET", f"{PAYMENT}/api/payment/earnings/summary", token=mentor["accessToken"])


def earning_row(mentor, sid):
    return next((r for r in call("GET", f"{PAYMENT}/api/payment/earnings", token=mentor["accessToken"]) if r["sessionId"] == sid), None)


def types(row):
    return [e["type"] for e in row["entries"]] if row else []


def notes(user, kind):
    return [n for n in call("GET", f"{MENTORING}/api/mentoring/notifications?limit=100", token=user["accessToken"])["items"]
            if n["type"] == kind]


# ------------------------------------------------------------------ US-25
def us25(ctx):
    print("US-25 — Sổ thu nhập mentor")
    admin = ctx["admin"]["accessToken"]
    mentor = approved_mentor(admin, "ledger")
    mentee = accepted_mentee(mentor, "ledger")
    ctx["ledger_mentor"], ctx["ledger_mentee"] = mentor, mentee

    s = paid(mentee, mentor, at(6, 9))
    row = earning_row(mentor, s["id"])
    sm = summary(mentor)
    check("US-25", "Charge 300.000đ → EARNING_PENDING 255.000 (= mentorEarning), chưa có available",
          row and types(row) == ["EARNING_PENDING"] and float(row["pending"]) == 255000 and float(row["available"]) == 0
          and float(sm["pending"]) == 255000 and float(sm["available"]) == 0, (row, sm))
    status, code = error_code(lambda: call("GET", f"{PAYMENT}/api/payment/earnings/summary", token=mentee["accessToken"]))
    check("US-25", "Mentee không xem được thu nhập (403)", status == 403, (status, code))

    completed(mentee, mentor, s["id"])
    row = earning_row(mentor, s["id"])
    check("US-25", "Phiên COMPLETED → payment nhận final-state, releaseAt = giờ kết thúc + 48h",
          row and row["finalState"] == "COMPLETED" and row["releaseAt"] is not None, row)
    pay_dev("jobs/earning-release")
    row = earning_row(mentor, s["id"])
    check("US-25", "Chưa đủ 48 giờ → job không giải phóng (vẫn PENDING)", float(row["pending"]) == 255000 and float(row["available"]) == 0, row)
    pay_dev(f"earnings/{s['id']}/due")
    pay_dev("jobs/earning-release")
    row = earning_row(mentor, s["id"])
    check("US-25", "Đủ 48 giờ → EARNING_AVAILABLE 255.000, pending = 0 (PENDING→AVAILABLE)",
          types(row) == ["EARNING_PENDING", "EARNING_AVAILABLE"] and float(row["available"]) == 255000 and float(row["pending"]) == 0, row)
    pay_dev("jobs/earning-release")
    check("US-25", "Job chạy lại idempotent (không ghi thêm dòng)", len(earning_row(mentor, s["id"])["entries"]) == 2)

    # Không ai trả lời trong 48 giờ → COMPLETED với giờ kết thúc 48h+ trước → giải phóng ngay khi nhận final-state
    s2 = paid(mentee, mentor, at(7, 9))
    ended(s2["id"], 48 * 60 + 5)
    dev("jobs/payment-outbox")
    row2 = earning_row(mentor, s2["id"])
    check("US-25", "Phiên kết thúc > 48 giờ (NO_ANSWER → COMPLETED) → AVAILABLE ngay khi báo final-state",
          row2 and row2["finalState"] == "COMPLETED" and float(row2["available"]) == 255000, row2)

    # REVERSAL theo tỉ lệ khi hoàn tiền
    s3 = paid(mentee, mentor, at(8, 9))
    call("POST", f"{PAYMENT}/internal/payments/refund", {"sessionId": s3["id"], "reason": "TEST", "percent": 50}, internal=True)
    row3 = earning_row(mentor, s3["id"])
    check("US-25", "Hoàn 50% → REVERSAL 127.500 (= 255.000 × 150.000/300.000), pending còn 127.500",
          types(row3) == ["EARNING_PENDING", "REVERSAL"] and float(row3["reversed"]) == 127500 and float(row3["pending"]) == 127500, row3)

    # Hoàn 100% trước khi giải phóng → không bao giờ có AVAILABLE
    s4 = paid(mentee, mentor, at(9, 9))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/cancel", {"reason": "Ban"}, token=mentee["accessToken"])
    row4 = earning_row(mentor, s4["id"])
    check("US-25", "Mentee huỷ ≥ 72h (hoàn 100%) → REVERSAL 255.000, pending = available = 0",
          row4 and float(row4["reversed"]) == 255000 and float(row4["pending"]) == 0 and float(row4["available"]) == 0
          and "EARNING_AVAILABLE" not in types(row4), row4)

    # Mentee huỷ muộn (< 72h, hoàn 0%) → mentor được trả: final-state CANCELLED, giải phóng sau 48 giờ
    s5 = paid(mentee, mentor, at(2, 15))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s5['id']}/cancel", {"reason": "Ban"}, token=mentee["accessToken"])
    dev("jobs/payment-outbox")
    row5 = earning_row(mentor, s5["id"])
    pay_dev(f"earnings/{s5['id']}/due")
    pay_dev("jobs/earning-release")
    row5b = earning_row(mentor, s5["id"])
    check("US-25", "Mentee huỷ muộn (0%) → final-state CANCELLED, sau 48 giờ AVAILABLE 255.000",
          row5 and row5["finalState"] == "CANCELLED" and float(row5["available"]) == 0 and float(row5b["available"]) == 255000,
          (row5, row5b))

    sm = summary(mentor)
    # pending: s3 127.500; available: s 255.000 + s2 255.000 + s5 255.000; reversed: s3 127.500 + s4 255.000
    check("US-25", "Summary = tổng các phiên: pending 127.500 / available 765.000 / paidOut 0 / reversed 382.500",
          float(sm["pending"]) == 127500 and float(sm["available"]) == 765000 and float(sm["paidOut"]) == 0
          and float(sm["reversed"]) == 382500 and sm["releaseDelayHours"] == 48, sm)


STORIES = {"US-25": us25}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 3 Team A (mentoring/payment) run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    ctx = {"admin": admin}
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
