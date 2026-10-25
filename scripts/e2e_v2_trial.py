#!/usr/bin/env python3
"""
E2E bản chốt v2.0 §10 — buổi trải nghiệm 15 phút, phí cố định 30.000đ, mỗi cặp một lần, không cần quan hệ mentoring.

    python3 scripts/e2e_v2_trial.py
"""
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AI, AUTH, MENTORING, PAYMENT, PROFILE, ApiError, call, complete_voice_interview, approve_mentor

VN = timezone(timedelta(hours=7))
RUN = uuid.uuid4().hex[:6]
AGENDA = "Lam quen voi mentor va hoi ve lo trinh hoc backend Java"
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
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"v2t.{role.lower()}.{name}.{RUN}@test.local",
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
    iv = complete_voice_interview(t)
    approve_mentor(admin_token, t, iv, "Duyet cho e2e v2.0 trial")
    return m


def mentee(name):
    me = register("MENTEE", name)
    call("PUT", f"{PROFILE}/api/profile/mentee/{me['userId']}", {
        "displayName": f"V2 Mentee {name} {RUN}", "goal": "Tro thanh backend developer Java trong 6 thang, nam vung Spring Boot.",
        "domain": "backend", "currentLevel": "BEGINNER", "skills": ["Java"], "portfolioLinks": []}, token=me["accessToken"])
    return me


def book_trial(me, mentor, start, kind="TRIAL", duration=15):
    return call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": me["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(), "durationMinutes": duration,
        "sessionType": "CAREER_ADVICE", "agenda": AGENDA, "kind": kind}, token=me["accessToken"])


def topup(me, amount):
    return call("POST", f"{PAYMENT}/api/payment/wallet/topups", {"amount": amount, "provider": "SANDBOX", "card": CARD}, token=me["accessToken"])


def wallet(me):
    return call("GET", f"{PAYMENT}/api/payment/wallet", token=me["accessToken"])


def dev(path, body=None):
    return call("POST", f"{MENTORING}/internal/dev/{path}", body or {}, internal=True)


def main():
    t0 = time.time()
    print(f"E2E v2.0 trial run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = approved_mentor(admin["accessToken"], "trial", 300000)
    prof = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor["accessToken"])
    check("Mentor mặc định nhận buổi trải nghiệm", prof["trialEnabled"] is True, prof.get("trialEnabled"))

    me = mentee("a")
    topup(me, 200000)
    slots = call("GET", f"{MENTORING}/api/mentoring/mentors/{mentor['userId']}/available-slots?durationMinutes=15&days=7", token=me["accessToken"])
    check("Khung giờ 15 phút trả về giá cố định 30.000 (không theo giá mentor)", float(slots["price"]) == 30000 and len(slots["slots"]) > 0, slots["price"])

    s = book_trial(me, mentor, at(3, 10))
    check("Đặt trải nghiệm không cần quan hệ mentoring → AWAITING_MENTOR (ví đủ tiền)",
          s["status"] == "AWAITING_MENTOR" and s["kind"] == "TRIAL" and s["durationMinutes"] == 15 and float(s["price"]) == 30000, s)
    check("Ví: cash 170.000, held 30.000", float(wallet(me)["cash"]) == 170000 and float(wallet(me)["held"]) == 30000, wallet(me))
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{s['id']}/transactions", token=me["accessToken"])
    check("Hoa hồng 15% như buổi thường: phí 4.500, mentor 25.500", float(txs[0]["fee"]) == 4500 and float(txs[0]["mentorEarning"]) == 25500, txs[0])

    status, code = error_code(lambda: book_trial(me, mentor, at(4, 10)))
    check("Mỗi cặp một lần → 409 TRIAL_ALREADY_USED", status == 409 and code == "TRIAL_ALREADY_USED", (status, code))
    status, code = error_code(lambda: book_trial(me, mentor, at(4, 10), kind="TRIAL", duration=60))
    check("Trải nghiệm phải đúng 15 phút → 400 INVALID_DURATION", status == 400 and code == "INVALID_DURATION", (status, code))

    call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/confirm", token=mentor["accessToken"])
    dev(f"sessions/{s['id']}/shift", {"startsInMinutes": 90})
    pv = call("GET", f"{MENTORING}/api/mentoring/sessions/{s['id']}/cancel-preview", token=me["accessToken"])
    check("Huỷ < 2 giờ → không hoàn (trải nghiệm chỉ có 100% hoặc 0%)", pv["refundPercent"] == 0, pv)
    dev(f"sessions/{s['id']}/shift", {"startsInMinutes": 5 * 60})
    pv = call("GET", f"{MENTORING}/api/mentoring/sessions/{s['id']}/cancel-preview", token=me["accessToken"])
    check("Huỷ ≥ 2 giờ → hoàn 100% (kể cả khi còn 5 giờ, không có bậc 50%)", pv["refundPercent"] == 100, pv)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/cancel", {}, token=me["accessToken"])
    check("Huỷ sớm hoàn lại ví và hoàn lại lượt trải nghiệm", float(wallet(me)["cash"]) == 200000, wallet(me))
    s2 = book_trial(me, mentor, at(4, 11))
    check("Sau khi lượt được hoàn lại, đặt lại được", s2["status"] == "AWAITING_MENTOR", s2["status"])

    print("\nGiới hạn 3 buổi chưa diễn ra / mentee; mentor tắt trải nghiệm; mentor khác")
    mentors = [approved_mentor(admin["accessToken"], f"t{i}", 200000) for i in range(3)]
    ok_count = 0
    for i, m in enumerate(mentors):
        try:
            book_trial(me, m, at(5 + i, 10))
            ok_count += 1
        except ApiError:
            pass
    check("Mentee có 1 buổi chưa diễn ra, đặt thêm 2 nữa (đủ 3) rồi bị chặn TRIAL_LIMIT", ok_count == 2, ok_count)
    status, code = error_code(lambda: book_trial(me, mentors[2], at(9, 10)))
    check("Buổi thứ 4 chưa diễn ra bị chặn", status == 409 and code in ("TRIAL_LIMIT", "TRIAL_ALREADY_USED"), (status, code))

    off = approved_mentor(admin["accessToken"], "off", 150000)
    call("PUT", f"{PROFILE}/api/profile/mentor/{off['userId']}/trial", {"enabled": False}, token=off["accessToken"])
    me2 = mentee("b")
    topup(me2, 100000)
    status, code = error_code(lambda: book_trial(me2, off, at(3, 10)))
    check("Mentor tắt trải nghiệm → 409 TRIAL_DISABLED", status == 409 and code == "TRIAL_DISABLED", (status, code))

    print("\nHết hạn xác nhận / mentor từ chối hoàn lại lượt; không chấm sao")
    me3 = mentee("c")
    topup(me3, 100000)
    s3 = book_trial(me3, mentor, at(7, 10))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s3['id']}/decline", {"reason": "Ban"}, token=mentor["accessToken"])
    check("Mentor từ chối: hoàn 100%, hoàn lại lượt", float(wallet(me3)["cash"]) == 100000, wallet(me3))
    s4 = book_trial(me3, mentor, at(7, 11))
    check("Đặt lại được sau khi bị từ chối", s4["status"] == "AWAITING_MENTOR")
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/confirm", token=mentor["accessToken"])
    dev(f"sessions/{s4['id']}/joined", {"mentor": True, "mentee": True})   # cả hai vào phòng (nhật ký §6)
    dev(f"sessions/{s4['id']}/shift", {"endedMinutesAgo": 30})
    dev("jobs/attendance")
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/attendance", {"answer": "HELD"}, token=me3["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/attendance", {"answer": "HELD"}, token=mentor["accessToken"])
    done = call("GET", f"{MENTORING}/api/mentoring/sessions/{s4['id']}", token=me3["accessToken"])
    check("Hai bên xác nhận đã diễn ra → COMPLETED", done["status"] == "COMPLETED", done["status"])
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/review",
                                           {"rating": 5, "comment": "Tot"}, token=me3["accessToken"]))
    check("Buổi trải nghiệm không chấm sao → 409 TRIAL_NOT_REVIEWABLE", status == 409 and code == "TRIAL_NOT_REVIEWABLE", (status, code))

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
