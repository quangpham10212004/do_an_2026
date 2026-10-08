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


# ------------------------------------------------------------------ US-32
def open_dispute(user, sid, dtype="QUALITY", description=DESC, links=None):
    return call("POST", f"{MENTORING}/api/mentoring/sessions/{sid}/disputes",
                {"type": dtype, "description": description, "evidenceLinks": links or []}, token=user["accessToken"])


def admin_call(ctx, method, path, body=None):
    return call(method, f"{MENTORING}/api/mentoring/admin/disputes{path}", body, token=ctx["admin"]["accessToken"])


def us32(ctx):
    print("US-32 — Tranh chấp")
    admin = ctx["admin"]["accessToken"]
    mentor = approved_mentor(admin, "dispute")
    mentee = accepted_mentee(mentor, "dispute")

    s = paid(mentee, mentor, at(6, 10))
    status, code = error_code(lambda: open_dispute(mentee, s["id"]))
    check("US-32", "Phiên chưa diễn ra (CONFIRMED) → 409 DISPUTE_NOT_ALLOWED", status == 409 and code == "DISPUTE_NOT_ALLOWED", (status, code))
    completed(mentee, mentor, s["id"])

    status, code = error_code(lambda: open_dispute(mentee, s["id"], description="Qua ngan"))
    check("US-32", "Mô tả < 20 ký tự → 400 INVALID_DESCRIPTION", status == 400 and code == "INVALID_DESCRIPTION", (status, code))
    status, code = error_code(lambda: open_dispute(mentee, s["id"], links=["http://khong-an-toan.example/x"]))
    check("US-32", "Link bằng chứng không phải https → 400 INVALID_EVIDENCE_LINK", status == 400 and code == "INVALID_EVIDENCE_LINK", (status, code))
    status, code = error_code(lambda: open_dispute(mentee, s["id"], links=[f"https://e.example/{i}" for i in range(6)]))
    check("US-32", "> 5 link bằng chứng → 400 TOO_MANY_EVIDENCE_LINKS", status == 400 and code == "TOO_MANY_EVIDENCE_LINKS", (status, code))

    d = open_dispute(mentee, s["id"], links=["https://drive.google.com/file/d/evidence"])
    t = txs(mentee, s["id"])[0]
    if t["status"] != "ON_HOLD":
        dev("jobs/payment-outbox")
        t = txs(mentee, s["id"])[0]
    check("US-32", "Mentee mở 'Báo cáo sự cố' → OPEN, giao dịch ON_HOLD",
          d["status"] == "OPEN" and d["openedByRole"] == "MENTEE" and t["status"] == "ON_HOLD", (d["status"], t["status"]))
    status, code = error_code(lambda: open_dispute(mentor, s["id"], dtype="BEHAVIOR"))
    check("US-32", "Mở tranh chấp thứ 2 cho cùng phiên → 409 DISPUTE_ALREADY_OPEN", status == 409 and code == "DISPUTE_ALREADY_OPEN", (status, code))
    check("US-32", "Hai bên + admin được báo DISPUTE_OPENED",
          notes(mentee, "DISPUTE_OPENED") and notes(mentor, "DISPUTE_OPENED") and notes(ctx["admin"], "DISPUTE_OPENED"))
    pay_dev(f"earnings/{s['id']}/due")
    pay_dev("jobs/earning-release")
    row = earning_row(mentor, s["id"])
    check("US-32", "Tranh chấp đang mở chặn giải phóng thu nhập (đủ 48h vẫn pending, ON_HOLD)",
          row["transactionStatus"] == "ON_HOLD" and float(row["available"]) == 0 and float(row["pending"]) == 255000, row)

    status, code = error_code(lambda: call("GET", f"{MENTORING}/api/mentoring/admin/disputes", token=mentor["accessToken"]))
    check("US-32", "Không phải admin → 403 ở /admin/disputes", status == 403, (status, code))
    active = admin_call(ctx, "GET", "?status=ACTIVE")
    item = next((x for x in active if x["id"] == d["id"]), None)
    check("US-32", "Admin thấy tranh chấp trong danh sách ACTIVE kèm SLA (hạn phản hồi = tạo + 48h, chưa quá hạn)",
          item is not None and item["firstResponseDueAt"] and item["overdue"] is False and item["session"]["mentorId"] == mentor["userId"],
          item)
    detail = admin_call(ctx, "GET", f"/{d['id']}")
    check("US-32", "Chi tiết tranh chấp có mô tả + bằng chứng", detail["evidenceLinks"] == ["https://drive.google.com/file/d/evidence"]
          and detail["description"] == DESC, detail)
    r = admin_call(ctx, "POST", f"/{d['id']}/start-review")
    check("US-32", "start-review: OPEN → IN_REVIEW, ghi firstResponseAt", r["status"] == "IN_REVIEW" and r["firstResponseAt"], r)
    status, code = error_code(lambda: admin_call(ctx, "POST", f"/{d['id']}/resolve", {"outcome": "PARTIAL_REFUND", "note": "x"}))
    check("US-32", "PARTIAL_REFUND thiếu refundPercent → 400 INVALID_REFUND_PERCENT", status == 400 and code == "INVALID_REFUND_PERCENT", (status, code))
    status, code = error_code(lambda: admin_call(ctx, "POST", f"/{d['id']}/resolve", {"outcome": "NO_REFUND"}))
    check("US-32", "Thiếu ghi chú → 400", status == 400, (status, code))

    res = admin_call(ctx, "POST", f"/{d['id']}/resolve", {"outcome": "PARTIAL_REFUND", "refundPercent": 50, "note": "Mentor vao muon"})
    t = txs(mentee, s["id"])[0]
    row = earning_row(mentor, s["id"])
    if float(row["available"]) == 0:
        dev("jobs/payment-outbox")
        t = txs(mentee, s["id"])[0]
        row = earning_row(mentor, s["id"])
    check("US-32", "Resolve PARTIAL 50% → 1 dòng refund 150.000, giao dịch PARTIALLY_REFUNDED (AC)",
          res["status"] == "RESOLVED" and res["outcome"] == "PARTIAL_REFUND" and t["status"] == "PARTIALLY_REFUNDED"
          and len(t["refunds"]) == 1 and float(t["refunds"][0]["amount"]) == 150000, (res["status"], t))
    check("US-32", "… và phần thu nhập còn lại 127.500 được giải phóng ngay (AVAILABLE) (AC)",
          float(row["available"]) == 127500 and float(row["reversed"]) == 127500 and float(row["pending"]) == 0, row)
    check("US-32", "Hai bên được báo DISPUTE_RESOLVED", notes(mentee, "DISPUTE_RESOLVED") and notes(mentor, "DISPUTE_RESOLVED"))
    status, code = error_code(lambda: admin_call(ctx, "POST", f"/{d['id']}/resolve", {"outcome": "NO_REFUND", "note": "x"}))
    check("US-32", "Resolve lần 2 → 409 DISPUTE_ALREADY_RESOLVED", status == 409 and code == "DISPUTE_ALREADY_RESOLVED", (status, code))
    v = get_session(mentee, s["id"])
    check("US-32", "Phiên hiển thị tranh chấp gần nhất (RESOLVED, 50%)", v["dispute"] and v["dispute"]["status"] == "RESOLVED"
          and v["refundPercent"] == 50, v.get("dispute"))

    # > 7 ngày sau giờ kết thúc → 409
    s2 = paid(mentee, mentor, at(7, 10))
    completed(mentee, mentor, s2["id"])
    dev(f"sessions/{s2['id']}/shift", {"endedMinutesAgo": 7 * 24 * 60 + 30})
    status, code = error_code(lambda: open_dispute(mentor, s2["id"]))
    check("US-32", "Mở sau 7 ngày kể từ giờ kết thúc → 409 DISPUTE_WINDOW_CLOSED", status == 409 and code == "DISPUTE_WINDOW_CLOSED", (status, code))

    # Phiên DISPUTED (US-12) → tranh chấp NO_SHOW tự tạo; NO_REFUND → COMPLETED, trả mentor
    s3 = paid(mentee, mentor, at(8, 10))
    ended(s3["id"], 5)
    attend(mentee, s3["id"], "HELD")
    attend(mentor, s3["id"], "MENTEE_NO_SHOW")
    dev("jobs/payment-outbox")
    auto = admin_call(ctx, "GET", "?status=OPEN")
    a = next((x for x in auto if x["sessionId"] == s3["id"]), None)
    check("US-32", "Phiên DISPUTED → hệ thống tự mở tranh chấp NO_SHOW (openedByRole SYSTEM), giao dịch ON_HOLD",
          a is not None and a["type"] == "NO_SHOW" and a["openedByRole"] == "SYSTEM" and txs(mentee, s3["id"])[0]["status"] == "ON_HOLD", a)
    if a:
        admin_call(ctx, "POST", f"/{a['id']}/resolve", {"outcome": "NO_REFUND", "note": "Phien da dien ra theo log"})
        dev("jobs/payment-outbox")
        v = get_session(mentee, s3["id"])
        t = txs(mentee, s3["id"])[0]
        row = earning_row(mentor, s3["id"])
        check("US-32", "NO_REFUND → phiên COMPLETED, giao dịch SUCCESS, thu nhập 255.000 AVAILABLE",
              v["status"] == "COMPLETED" and t["status"] == "SUCCESS" and t["refunds"] == [] and float(row["available"]) == 255000,
              (v["status"], t["status"], row))


# ------------------------------------------------------------------ US-31
def end_request(user, rid, reason="GOAL_REACHED", note=None):
    return call("POST", f"{MENTORING}/api/mentoring/requests/{rid}/end", {"reason": reason, "note": note}, token=user["accessToken"])


def my_request(user, rid):
    return next(r for r in call("GET", f"{MENTORING}/api/mentoring/requests", token=user["accessToken"]) if r["id"] == rid)


def us31(ctx):
    print("US-31 — Kết thúc mentoring")
    admin = ctx["admin"]["accessToken"]
    mentor = approved_mentor(admin, "end")
    mentee = accepted_mentee(mentor, "end")

    late = paid(mentee, mentor, at(2, 15))          # < 72h → mentee kết thúc: hoàn 0%
    early = paid(mentee, mentor, at(6, 9))          # ≥ 72h → hoàn 100%
    unpaid = book(mentee, mentor, at(8, 9))         # PENDING chưa thanh toán
    status, code = error_code(lambda: end_request(mentee, mentee["requestId"], reason="INACTIVE"))
    check("US-31", "reason INACTIVE (chỉ hệ thống) → 400 INVALID_END_REASON", status == 400 and code == "INVALID_END_REASON", (status, code))
    stranger = mentee_with_profile("end-stranger")
    status, code = error_code(lambda: end_request(stranger, mentee["requestId"]))
    check("US-31", "Người ngoài quan hệ → 403", status == 403, (status, code))

    r = end_request(mentee, mentee["requestId"], note="Da dat muc tieu, cam on anh")
    check("US-31", "Mentee kết thúc → ENDED kèm endedBy/endReason/endNote/endedAt",
          r["status"] == "ENDED" and r["endedBy"] == "MENTEE" and r["endReason"] == "GOAL_REACHED"
          and r["endNote"] == "Da dat muc tieu, cam on anh" and r["endedAt"], r)
    v_late, v_early, v_unpaid = (get_session(mentee, x["id"]) for x in (late, early, unpaid))
    t_late, t_early = txs(mentee, late["id"])[0], txs(mentee, early["id"])[0]
    check("US-31", "Phiên < 72h bị huỷ như mentee huỷ: hoàn 0%, giao dịch vẫn SUCCESS",
          v_late["status"] == "CANCELLED" and v_late["cancelledBy"] == "MENTEE" and v_late["refundPercent"] == 0
          and t_late["status"] == "SUCCESS" and t_late["refunds"] == [], (v_late["status"], v_late["refundPercent"], t_late["status"]))
    check("US-31", "Phiên ≥ 72h bị huỷ: hoàn 100% (REFUNDED)",
          v_early["status"] == "CANCELLED" and v_early["refundPercent"] == 100 and t_early["status"] == "REFUNDED",
          (v_early["status"], v_early["refundPercent"], t_early["status"]))
    check("US-31", "Phiên chờ thanh toán cũng bị huỷ", v_unpaid["status"] == "CANCELLED", v_unpaid["status"])
    check("US-31", "Mentor được báo MENTORING_ENDED", notes(mentor, "MENTORING_ENDED"))
    status, code = error_code(lambda: end_request(mentor, mentee["requestId"]))
    check("US-31", "Kết thúc lần 2 → 409 REQUEST_NOT_ACTIVE", status == 409 and code == "REQUEST_NOT_ACTIVE", (status, code))
    status, code = error_code(lambda: book(mentee, mentor, at(9, 9)))
    check("US-31", "Sau khi kết thúc không đặt lịch được (400 NOT_ACCEPTED)", status == 400 and code == "NOT_ACCEPTED", (status, code))
    count = call("GET", f"{PROFILE}/internal/mentor/{mentor['userId']}", internal=True)["activeMenteeCount"]
    check("US-31", "activeMenteeCount đồng bộ chỉ đếm ACCEPTED (= 0)", count == 0, count)

    m2 = accepted_mentee(mentor, "end-by-mentor")
    s2 = paid(m2, mentor, at(6, 11))
    r2 = end_request(mentor, m2["requestId"], reason="NOT_A_FIT")
    v2 = get_session(m2, s2["id"])
    check("US-31", "Mentor kết thúc → phiên sắp tới huỷ như mentor huỷ (hoàn 100%, cancelledBy MENTOR)",
          r2["endedBy"] == "MENTOR" and v2["status"] == "CANCELLED" and v2["cancelledBy"] == "MENTOR" and v2["refundPercent"] == 100
          and txs(m2, s2["id"])[0]["status"] == "REFUNDED", (r2["endedBy"], v2["status"], v2["cancelledBy"]))

    # Không hoạt động: 30 ngày → nhắc; đặt phiên → xoá nhắc
    m3 = accepted_mentee(mentor, "idle-warn")
    dev(f"requests/{m3['requestId']}/inactivity", {"lastActivityDaysAgo": 29})
    dev("jobs/inactivity")
    check("US-31", "29 ngày không hoạt động → chưa nhắc", my_request(m3, m3["requestId"])["inactivityWarnedAt"] is None)
    dev(f"requests/{m3['requestId']}/inactivity", {"lastActivityDaysAgo": 31})
    dev("jobs/inactivity")
    r3 = my_request(m3, m3["requestId"])
    check("US-31", "31 ngày không có phiên → nhắc 'Bạn có muốn tiếp tục?' cho cả hai, ghi inactivityWarnedAt",
          r3["status"] == "ACCEPTED" and r3["inactivityWarnedAt"] and notes(m3, "MENTORING_INACTIVE") and notes(mentor, "MENTORING_INACTIVE"), r3)
    book(m3, mentor, at(10, 9))
    check("US-31", "Đặt phiên mới xoá nhắc", my_request(m3, m3["requestId"])["inactivityWarnedAt"] is None)

    # Đã nhắc + 7 ngày không có phiên → ENDED INACTIVE (SYSTEM)
    m4 = accepted_mentee(mentor, "idle-end")
    dev(f"requests/{m4['requestId']}/inactivity", {"lastActivityDaysAgo": 37, "warnedDaysAgo": 6})
    dev("jobs/inactivity")
    check("US-31", "Nhắc được 6 ngày → vẫn ACCEPTED", my_request(m4, m4["requestId"])["status"] == "ACCEPTED")
    dev(f"requests/{m4['requestId']}/inactivity", {"lastActivityDaysAgo": 38, "warnedDaysAgo": 8})
    dev("jobs/inactivity")
    r4 = my_request(m4, m4["requestId"])
    check("US-31", "Nhắc + 7 ngày không có phiên mới → ENDED reason INACTIVE, endedBy SYSTEM",
          r4["status"] == "ENDED" and r4["endReason"] == "INACTIVE" and r4["endedBy"] == "SYSTEM", r4)


# ------------------------------------------------------------------ US-27 (phía mentoring)
def us27(ctx):
    print("US-27 — POST /internal/mentors/{id}/suspend (phía mentoring)")
    admin = ctx["admin"]
    mentor = approved_mentor(admin["accessToken"], "suspend")
    a = accepted_mentee(mentor, "suspend-a")
    b = accepted_mentee(mentor, "suspend-b")
    s1 = paid(a, mentor, at(2, 15))      # < 72h — hệ thống huỷ vẫn hoàn 100%
    s2 = paid(b, mentor, at(6, 9))
    s3 = book(a, mentor, at(8, 9))       # chưa thanh toán
    status, code = error_code(lambda: call("POST", f"{MENTORING}/internal/mentors/{mentor['userId']}/suspend", {"reason": "x"}))
    check("US-27", "Không có X-Internal-Token → 401/403", status in (401, 403), (status, code))
    res = call("POST", f"{MENTORING}/internal/mentors/{mentor['userId']}/suspend",
               {"reason": "ADMIN_SUSPEND", "actorId": admin["userId"]}, internal=True)
    check("US-27", "Suspend → cancelledSessions = 3", res["cancelledSessions"] == 3, res)
    v1, v2, v3 = get_session(a, s1["id"]), get_session(b, s2["id"]), get_session(a, s3["id"])
    check("US-27", "Mọi phiên sắp tới CANCELLED, cancelledBy SYSTEM",
          all(v["status"] == "CANCELLED" and v["cancelledBy"] == "SYSTEM" for v in (v1, v2, v3)), [(v["status"], v["cancelledBy"]) for v in (v1, v2, v3)])
    t1, t2 = txs(a, s1["id"])[0], txs(b, s2["id"])[0]
    check("US-27", "Phiên đã thanh toán hoàn 100% (kể cả < 72h)",
          t1["status"] == "REFUNDED" and t2["status"] == "REFUNDED" and v1["refundPercent"] == 100, (t1["status"], t2["status"]))
    check("US-27", "Mentee được báo SESSION_CANCELLED", notes(a, "SESSION_CANCELLED") and notes(b, "SESSION_CANCELLED"))
    row = earning_row(mentor, s1["id"])
    check("US-27", "Thu nhập của phiên bị thu hồi toàn bộ (REVERSAL)", row and float(row["reversed"]) == 255000 and float(row["pending"]) == 0, row)
    again = call("POST", f"{MENTORING}/internal/mentors/{mentor['userId']}/suspend", {"reason": "ADMIN_SUSPEND"}, internal=True)
    check("US-27", "Gọi lại idempotent → cancelledSessions = 0", again["cancelledSessions"] == 0, again)


STORIES = {"US-25": us25, "US-32": us32, "US-31": us31, "US-27": us27}


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
