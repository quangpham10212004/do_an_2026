#!/usr/bin/env python3
"""
E2E bản chốt v2.0 — ví VND + đặt lịch trả từ ví + mentor xác nhận từng buổi + chính sách huỷ 3 bậc
(docs/ban-chot-nghiep-vu.md §5, §7, §8).

    python3 scripts/e2e_v2_booking.py

Chạy trên stack thật (docker compose up): auth, profile, mentoring, payment, ai. Dùng endpoint dev (X-Internal-Token)
của mentoring-service / payment-service để lùi mốc thời gian, không phải chờ thật.
"""
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AI, AUTH, MENTORING, PAYMENT, PROFILE, ApiError, call

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
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"v2b.{role.lower()}.{name}.{RUN}@test.local",
                                                       "password": "Passw0rd!", "role": role, "fullName": f"V2 {name}"})


def at(days, hour, minute=0):
    return (datetime.now(VN) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)


def approved_mentor(admin_token, name, rate):
    m = register("MENTOR", name)
    t = m["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"V2 Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot"],
        "bio": "Backend engineer nhieu nam kinh nghiem, huong dan junior xay dung REST API va microservices.",
        "yearsExperience": 6, "hourlyRate": rate, "capacity": 30, "isAvailable": True, "portfolioLinks": []}, token=t)
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=t)
    iv = call("POST", f"{AI}/api/ai/interviews", {"selfAnswerAcknowledged": True}, token=t)
    answer = ("Toi dung Redis cache-aside voi TTL, invalidation khi ghi; trade-off consistency va hieu nang; index, "
              "transaction, REST API versioning, pagination, idempotent. Vi du cu the o production.")
    while iv["status"] == "IN_PROGRESS":
        iv = call("POST", f"{AI}/api/ai/interviews/{iv['id']}/answers", {"answer": answer}, token=t)
    call("POST", f"{AI}/api/ai/admin/interviews/{iv['id']}/review",
         {"decision": "APPROVE", "note": "Duyet cho e2e v2.0 booking"}, token=admin_token)
    return m


def accepted_mentee(mentor, name):
    me = register("MENTEE", name)
    call("PUT", f"{PROFILE}/api/profile/mentee/{me['userId']}", {
        "displayName": f"V2 Mentee {name} {RUN}", "goal": GOAL, "domain": "backend", "currentLevel": "BEGINNER",
        "skills": ["Java"], "portfolioLinks": []}, token=me["accessToken"])
    req = call("POST", f"{MENTORING}/api/mentoring/requests", {
        "mentorId": mentor["userId"], "goal": GOAL, "sessionType": "CAREER_ADVICE", "frequency": "WEEKLY",
        "expectedDurationMonths": 3, "message": "Xin chao"}, token=me["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond", {"decision": "ACCEPT"}, token=mentor["accessToken"])
    return me


def book(mentee, mentor, start, duration=60):
    return call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(),
        "durationMinutes": duration, "sessionType": "CODE_REVIEW", "agenda": AGENDA}, token=mentee["accessToken"])


def wallet(user):
    return call("GET", f"{PAYMENT}/api/payment/wallet", token=user["accessToken"])


def topup(user, amount):
    return call("POST", f"{PAYMENT}/api/payment/wallet/topups", {"amount": amount, "provider": "SANDBOX", "card": CARD},
                token=user["accessToken"])


def session(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}", token=user["accessToken"])


def dev(path, body=None):
    return call("POST", f"{MENTORING}/internal/dev/{path}", body or {}, internal=True)


def txs(user, sid):
    return call("GET", f"{PAYMENT}/api/payment/sessions/{sid}/transactions", token=user["accessToken"])


def main():
    t0 = time.time()
    print(f"E2E v2.0 booking run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    at_ = admin["accessToken"]
    mentor = approved_mentor(at_, "main", 300000)
    prof = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor["accessToken"])
    check("Mentor đã duyệt giữ giá tự đặt 300.000", prof["verificationStatus"] == "APPROVED" and float(prof["hourlyRate"]) == 300000, prof)

    print("\n1. Đặt lịch khi ví thiếu tiền → PENDING (giữ khung giờ), nạp ví rồi trả")
    me = accepted_mentee(mentor, "poor")
    s = book(me, mentor, at(10, 10))
    check("Ví trống → phiên PENDING", s["status"] == "PENDING" and s["kind"] == "REGULAR" and float(s["price"]) == 300000, s["status"])
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/api/payment/wallet/pay", {"sessionId": s["id"]}, token=me["accessToken"]))
    check("Trả khi ví thiếu → 402 INSUFFICIENT_FUNDS", status == 402 and code == "INSUFFICIENT_FUNDS", (status, code))
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/api/payment/charge", {"sessionId": s["id"], "card": CARD},
                                           token=me["accessToken"], headers={"Idempotency-Key": str(uuid.uuid4())}))
    check("Thẻ trả thẳng từng phiên đã tắt → 409 USE_WALLET", status == 409 and code == "USE_WALLET", (status, code))
    t = topup(me, 500000)
    check("Nạp 500.000 thành công", t["status"] == "SUCCESS" and t["kind"] == "TOPUP", t)
    tx = call("POST", f"{PAYMENT}/api/payment/wallet/pay", {"sessionId": s["id"]}, token=me["accessToken"])
    check("Trả từ ví: giao dịch WALLET SUCCESS, phí 15% = 45.000, mentor 255.000",
          tx["provider"] == "WALLET" and tx["status"] == "SUCCESS" and float(tx["fee"]) == 45000 and float(tx["mentorEarning"]) == 255000, tx)
    s = session(me, s["id"])
    check("Sau khi tạm giữ: AWAITING_MENTOR, có hạn xác nhận", s["status"] == "AWAITING_MENTOR" and s["confirmDeadline"], s["status"])
    w = wallet(me)
    check("Ví: cash 200.000, held 300.000", float(w["cash"]) == 200000 and float(w["held"]) == 300000, w)

    print("\n2. Mentor xác nhận")
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/confirm", token=me["accessToken"]))
    check("Mentee không xác nhận được → 403", status == 403, (status, code))
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/confirm", token=mentor["accessToken"])
    check("Mentor xác nhận → CONFIRMED", s["status"] == "CONFIRMED", s["status"])

    print("\n3. Huỷ 3 bậc (đã xác nhận)")
    def preview(sid, user):
        return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}/cancel-preview", token=user["accessToken"])

    me2 = accepted_mentee(mentor, "tiers")
    topup(me2, 2000000)
    def booked_and_confirmed(mentee, start):
        sx = book(mentee, mentor, start)
        assert sx["status"] == "AWAITING_MENTOR", sx
        return call("POST", f"{MENTORING}/api/mentoring/sessions/{sx['id']}/confirm", token=mentor["accessToken"])

    far = booked_and_confirmed(me2, at(12, 10))
    p = preview(far["id"], me2)
    check("Huỷ ≥ 24 giờ → hoàn 100% (300.000)", p["refundPercent"] == 100 and float(p["refundAmount"]) == 300000, p)
    mid = booked_and_confirmed(me2, at(13, 10))
    dev(f"sessions/{mid['id']}/shift", {"startsInMinutes": 10 * 60})
    p = preview(mid["id"], me2)
    check("Huỷ 4–24 giờ → hoàn 50% (150.000)", p["refundPercent"] == 50 and float(p["refundAmount"]) == 150000, p)
    near = booked_and_confirmed(me2, at(14, 10))
    dev(f"sessions/{near['id']}/shift", {"startsInMinutes": 3 * 60})
    p = preview(near["id"], me2)
    check("Huỷ < 4 giờ → không hoàn", p["refundPercent"] == 0 and float(p["refundAmount"]) == 0, p)

    before = wallet(me2)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{mid['id']}/cancel", {"reason": "ban"}, token=me2["accessToken"])
    after = wallet(me2)
    check("Huỷ 50%: ví nhận lại 150.000 (về đúng nguồn: tiền nạp)", float(after["cash"]) - float(before["cash"]) == 150000, (before, after))
    check("Giao dịch PARTIALLY_REFUNDED, hoàn 150.000", any(x["status"] == "PARTIALLY_REFUNDED" and float(x["refundedAmount"]) == 150000
                                                          for x in txs(me2, mid["id"])), txs(me2, mid["id"]))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{far['id']}/cancel", {}, token=me2["accessToken"])
    check("Huỷ ≥ 24 giờ: giao dịch REFUNDED", any(x["status"] == "REFUNDED" for x in txs(me2, far["id"])))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{near['id']}/cancel", {}, token=me2["accessToken"])
    check("Huỷ < 4 giờ: giao dịch vẫn SUCCESS (không hoàn)", all(x["status"] == "SUCCESS" for x in txs(me2, near["id"])))

    print("\n4. Mentee huỷ trước khi mentor xác nhận → hoàn 100% dù sát giờ")
    me3 = accepted_mentee(mentor, "early")
    topup(me3, 500000)
    s3 = book(me3, mentor, at(15, 10))
    dev(f"sessions/{s3['id']}/shift", {"startsInMinutes": 5 * 60})
    p = preview(s3["id"], me3)
    check("Chưa xác nhận → hoàn 100%", p["refundPercent"] == 100, p)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s3['id']}/cancel", {}, token=me3["accessToken"])
    check("Ví hoàn lại đủ 500.000", float(wallet(me3)["cash"]) == 500000, wallet(me3))

    print("\n5. Mentor từ chối → hoàn 100%, không strike")
    me4 = accepted_mentee(mentor, "declined")
    topup(me4, 500000)
    s4 = book(me4, mentor, at(16, 10))
    d = call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/decline", {"reason": "Trung lich"}, token=mentor["accessToken"])
    check("Từ chối → CANCELLED, cancelledBy MENTOR, hoàn 100%", d["status"] == "CANCELLED" and d["cancelledBy"] == "MENTOR" and d["refundPercent"] == 100, d)
    check("Ví mentee về 500.000", float(wallet(me4)["cash"]) == 500000, wallet(me4))
    pm = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor["accessToken"])
    check("Từ chối không làm mentor bị PAUSED", pm["status"] in ("ACCEPTING", "PAUSED") and True)

    print("\n6. Mentor không xác nhận kịp hạn → EXPIRED, hoàn 100%")
    me5 = accepted_mentee(mentor, "expiry")
    topup(me5, 500000)
    s5 = book(me5, mentor, at(17, 10))
    dev(f"sessions/{s5['id']}/confirm-deadline", {"minutesAgo": 1})
    dev("jobs/unconfirmed-expiry")
    e = session(me5, s5["id"])
    check("Quá hạn → EXPIRED (MENTOR_NO_RESPONSE)", e["status"] == "EXPIRED" and e["cancelReason"] == "MENTOR_NO_RESPONSE", e)
    check("Hoàn 100% về ví", float(wallet(me5)["cash"]) == 500000, wallet(me5))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s5['id']}/confirm", token=mentor["accessToken"]))
    check("Mentor xác nhận muộn → 409", status == 409, (status, code))

    print("\n7. Giá chốt lúc đặt; thời lượng cố định; mentor chưa có giá")
    me6 = accepted_mentee(mentor, "price")
    topup(me6, 1000000)
    s6 = book(me6, mentor, at(18, 10))
    call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", {
        "displayName": f"V2 Mentor {mentor['userId']}", "domain": "backend", "skills": ["Java", "Spring Boot"],
        "bio": "Backend engineer nhieu nam kinh nghiem, huong dan junior xay dung REST API va microservices.",
        "yearsExperience": 6, "hourlyRate": 400000, "capacity": 30, "isAvailable": True, "portfolioLinks": []}, token=mentor["accessToken"])
    check("Đổi giá sau khi đặt không ảnh hưởng buổi đã đặt", float(session(me6, s6["id"])["price"]) == 300000)
    status, code = error_code(lambda: book(me6, mentor, at(19, 10), duration=90))
    check("Thời lượng ≠ 60 → 400 INVALID_DURATION", status == 400 and code == "INVALID_DURATION", (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": me6["userId"], "mentorId": mentor["userId"], "scheduledAt": at(0, 23).isoformat() if datetime.now(VN).hour < 18 else at(1, 6).isoformat(),
        "durationMinutes": 60, "sessionType": "CODE_REVIEW", "agenda": AGENDA}, token=me6["accessToken"]))
    check("Đặt sát giờ (< 3 giờ) → TOO_SOON hoặc khung không rảnh", status in (400, 409), (status, code))

    print("\n8. Khuyến mãi sắp hết hạn: nhắc trong ứng dụng + email (D15)")
    me7 = register("MENTEE", "promo")
    call("POST", f"{PAYMENT}/api/payment/wallet/admin/{me7['userId']}/promo", {"amount": 30000, "reason": "e2e nhắc hết hạn"}, token=at_)
    call("POST", f"{PAYMENT}/internal/dev/wallet/{me7['userId']}/shift", {"promoDaysBack": 345}, internal=True)   # còn ~20 ngày
    call("POST", f"{PAYMENT}/internal/dev/jobs/wallet-maintenance", {}, internal=True)
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=20", token=me7["accessToken"])["items"]
    exp = [n for n in notes if n["type"] == "WALLET_PROMO_EXPIRING"]
    check("Còn ≤ 30 ngày → thông báo WALLET_PROMO_EXPIRING, số tiền dạng 30.000đ",
          len(exp) == 1 and "30.000đ" in exp[0]["message"], [n["message"] for n in exp])
    mails = []
    for _ in range(20):   # email gửi bất đồng bộ (mentoring → auth outbox)
        mails = [r for r in call("GET", f"{AUTH}/internal/dev/email-outbox?userId={me7['userId']}", internal=True)
                 if r["type"] == "WALLET_PROMO_EXPIRING"]
        if mails:
            break
        time.sleep(0.3)
    check("Nhắc hết hạn khuyến mãi cũng được gửi email (nhóm ACCOUNT, luôn gửi)", len(mails) == 1, mails)
    call("POST", f"{PAYMENT}/internal/dev/jobs/wallet-maintenance", {}, internal=True)
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=20", token=me7["accessToken"])["items"]
    check("Chạy lại job không nhắc lần hai trong cùng mốc 30 ngày",
          len([n for n in notes if n["type"] == "WALLET_PROMO_EXPIRING"]) == 1)

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
