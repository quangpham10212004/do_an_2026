#!/usr/bin/env python3
"""
E2E Sprint 1 (P0) — mentoring-service + payment-service: US-03 form đặt lịch, US-05 kiểm tra đặt lịch,
US-04 link phòng họp, US-01 chính sách huỷ, US-02 strike mentor, US-06 dời lịch.

Chạy khi hệ thống đang chạy (docker compose up) — mỗi lần tạo người dùng mới nên chạy lặp được:

    python3 scripts/e2e_p0_mentoring.py

Biến môi trường URL giống scripts/common.py. Điểm thưởng xin lỗi đi qua outbox (job mỗi phút) nên bước
kiểm tra điểm chờ tối đa OUTBOX_WAIT giây (mặc định 100).
"""
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AI, AUTH, MENTORING, PAYMENT, PROFILE, ApiError, call, charge

VN = timezone(timedelta(hours=7))
RUN = uuid.uuid4().hex[:6]
OUTBOX_WAIT = int(os.getenv("OUTBOX_WAIT", "100"))
AGENDA = "Review kien truc REST API va cach to chuc service layer"
CARD = {"cardNumber": "4242 4242 4242 4242", "expiry": (datetime.now() + timedelta(days=800)).strftime("%m/%y"), "cvv": "123"}
# US-14 (Sprint 2): yêu cầu mentoring bắt buộc goal (50–1000 ký tự), sessionType, frequency, expectedDurationMonths
REQUEST_FORM = {"goal": "Muon tro thanh backend developer Java, nam vung Spring Boot, REST API va microservices.",
                "sessionType": "CAREER_ADVICE", "frequency": "WEEKLY", "expectedDurationMonths": 3}
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
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"p0.{role.lower()}.{name}.{RUN}@test.local",
                                                       "password": "Passw0rd!", "role": role, "fullName": f"P0 {name}"})


def at(days, hour, minute=0):
    return (datetime.now(VN) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)


def approved_mentor(admin_token, name, hourly_rate):
    m = register("MENTOR", name)
    t = m["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"P0 Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot"],
        "bio": "Backend engineer nhieu nam kinh nghiem, huong dan junior xay dung REST API va microservices.",
        "yearsExperience": 6, "hourlyRate": hourly_rate, "capacity": 5, "isAvailable": True, "portfolioLinks": []}, token=t)
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}/availability", {
        "slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=t)
    interview = call("POST", f"{AI}/api/ai/interviews", token=t)
    answer = ("Toi dung Redis cache-aside voi TTL, invalidation khi ghi; trade-off consistency va hieu nang; index, "
              "transaction, REST API versioning, pagination, idempotent. Vi du cu the o production.")
    while interview["status"] == "IN_PROGRESS":
        interview = call("POST", f"{AI}/api/ai/interviews/{interview['id']}/answers", {"answer": answer}, token=t)
    call("POST", f"{AI}/api/ai/admin/interviews/{interview['id']}/review", {"decision": "APPROVE", "note": "ok"}, token=admin_token)
    return m


def accepted_mentee(mentor, name):
    me = register("MENTEE", name)
    req = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"], "message": "Xin chao", **REQUEST_FORM},
               token=me["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond", {"decision": "ACCEPT"}, token=mentor["accessToken"])
    return me


def book(mentee, mentor, start, duration=60, **extra):
    body = {"menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(),
            "durationMinutes": duration, "sessionType": "CODE_REVIEW", "agenda": AGENDA}
    body.update(extra)
    return call("POST", f"{MENTORING}/api/mentoring/sessions", body, token=mentee["accessToken"])


def pay(mentee, session):
    return charge(session["id"], CARD, mentee["accessToken"])   # US-13: kèm Idempotency-Key


def slots(mentee, mentor, duration=30, days=7, exclude=None):
    url = f"{MENTORING}/api/mentoring/mentors/{mentor['userId']}/available-slots?durationMinutes={duration}&days={days}"
    if exclude:
        url += f"&excludeSessionId={exclude}"
    return [datetime.fromisoformat(s["startAt"]) for s in call("GET", url, token=mentee["accessToken"])["slots"]]


def get_session(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}", token=user["accessToken"])


def main():
    t0 = time.time()
    print(f"E2E P0 mentoring/payment run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = approved_mentor(admin["accessToken"], "main", 200000)
    mentee = accepted_mentee(mentor, "main")

    # ---------------- US-03 ----------------
    print("US-03 — Form đặt lịch")
    status, code = error_code(lambda: book(mentee, mentor, at(5, 9), duration=75))
    check("US-03", "Thời lượng ngoài 30/45/60/90/120 bị từ chối", status == 400 and code == "INVALID_DURATION", (status, code))
    status, code = error_code(lambda: book(mentee, mentor, at(5, 9), agenda="qua ngan"))
    check("US-03", "Agenda < 20 ký tự bị từ chối", status == 400 and code == "INVALID_AGENDA", (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": at(5, 9).isoformat(), "durationMinutes": 60},
        token=mentee["accessToken"]))
    check("US-03", "Thiếu sessionType/agenda bị từ chối (400)", status == 400, (status, code))
    s45 = book(mentee, mentor, at(5, 9), duration=45, preReadLink="https://github.com/example/repo")
    check("US-03", "Phiên 45 phút lưu sessionType/agenda/preReadLink, giá = 150.000đ",
          s45["durationMinutes"] == 45 and s45["sessionType"] == "CODE_REVIEW" and s45["agenda"] == AGENDA
          and s45["preReadLink"] == "https://github.com/example/repo" and float(s45["price"]) == 150000, s45)

    # ---------------- US-05 ----------------
    print("\nUS-05 — Kiểm tra đặt lịch")
    soon = (datetime.now(VN) + timedelta(hours=4)).replace(minute=0, second=0, microsecond=0)
    status, code = error_code(lambda: book(mentee, mentor, soon))
    check("US-05", "Đặt trước < minNoticeHours (mặc định 12h) bị từ chối", status == 400 and code == "TOO_SOON", (status, code))
    s10 = book(mentee, mentor, at(6, 10))
    free = slots(mentee, mentor, duration=30, days=7)
    check("US-05", "Phiên 10:00–11:00 + buffer 15': 11:00 bị loại, 11:30 còn trống",
          at(6, 11) not in free and at(6, 11, 30) in free and at(6, 9) in free, [f.isoformat() for f in free if f.date() == at(6, 0).date()][:12])
    other = accepted_mentee(mentor, "other")
    status, code = error_code(lambda: book(other, mentor, at(6, 11), duration=30))
    check("US-05", "Mentee khác đặt 11:00 (trong buffer) bị từ chối 409", status == 409 and code == "MENTOR_NOT_AVAILABLE", (status, code))
    check("US-05", "Mentee khác đặt 11:30 được", book(other, mentor, at(6, 11, 30), duration=30)["status"] == "PENDING")

    # ---------------- US-04 ----------------
    print("\nUS-04 — Link phòng họp")
    check("US-04", "Phiên PENDING không trả meetingLink", s10["meetingLink"] is None)
    status, code = error_code(lambda: call("PUT", f"{MENTORING}/api/mentoring/sessions/{s10['id']}/meeting-link",
                                           {"meetingLink": "https://example.com/room"}, token=mentor["accessToken"]))
    check("US-04", "Link ngoài meet/zoom/teams bị từ chối", status == 400 and code == "INVALID_MEETING_LINK", (status, code))
    status, code = error_code(lambda: call("PUT", f"{MENTORING}/api/mentoring/sessions/{s10['id']}/meeting-link",
                                           {"meetingLink": "https://meet.google.com/abc-defg-hij"}, token=mentee["accessToken"]))
    check("US-04", "Mentee không đổi được link (403)", status == 403, (status, code))
    upd = call("PUT", f"{MENTORING}/api/mentoring/sessions/{s10['id']}/meeting-link",
               {"meetingLink": "https://us02web.zoom.us/j/123456789"}, token=mentor["accessToken"])
    check("US-04", "Mentor đặt link; vẫn ẩn khi PENDING", upd["meetingLink"] is None)
    pay(mentee, s10)
    check("US-04", "Sau thanh toán (CONFIRMED) mentee thấy link",
          get_session(mentee, s10["id"])["meetingLink"] == "https://us02web.zoom.us/j/123456789")

    # ---------------- US-01 ----------------
    print("\nUS-01 — Chính sách huỷ")
    early = book(mentee, mentor, at(8, 15))
    pay(mentee, early)
    p = call("GET", f"{MENTORING}/api/mentoring/sessions/{early['id']}/cancel-preview", token=mentee["accessToken"])
    check("US-01", "Preview mentee huỷ ≥ 72h: 100%, 200.000đ", p["refundPercent"] == 100 and float(p["refundAmount"]) == 200000, p)
    p = call("GET", f"{MENTORING}/api/mentoring/sessions/{s10['id']}/cancel-preview", token=mentee["accessToken"])
    late_expected = (at(6, 10) - datetime.now(VN)) < timedelta(hours=72)
    check("US-01", "Preview mentee huỷ < 72h: 0%" if late_expected else "Preview (phiên ≥ 72h) 100%",
          (p["refundPercent"] == 0 and float(p["refundAmount"]) == 0) if late_expected else p["refundPercent"] == 100, p)
    near = book(mentee, mentor, at(2, 16))
    pay(mentee, near)
    cancelled = call("POST", f"{MENTORING}/api/mentoring/sessions/{near['id']}/cancel", {"reason": "Ban viec"}, token=mentee["accessToken"])
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{near['id']}/transactions", token=mentee["accessToken"])
    check("US-01", "Mentee huỷ < 72h: CANCELLED, cancelledBy=MENTEE, refundPercent=0, giao dịch vẫn SUCCESS",
          cancelled["cancelledBy"] == "MENTEE" and cancelled["refundPercent"] == 0 and cancelled["cancelReason"] == "Ban viec"
          and any(t["status"] == "SUCCESS" for t in txs), (cancelled, txs))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{early['id']}/cancel", token=mentee["accessToken"])
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{early['id']}/transactions", token=mentee["accessToken"])
    check("US-01", "Mentee huỷ ≥ 72h: giao dịch REFUNDED", any(t["status"] == "REFUNDED" for t in txs), txs)

    by_mentor = book(mentee, mentor, at(9, 15))
    pay(mentee, by_mentor)
    p = call("GET", f"{MENTORING}/api/mentoring/sessions/{by_mentor['id']}/cancel-preview", token=mentor["accessToken"])
    check("US-01", "Preview mentor huỷ: 100% + 20 điểm", p["cancelledBy"] == "MENTOR" and p["refundPercent"] == 100
          and p["rewardPoints"] == 20, p)
    before_points = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=mentee["accessToken"])["pointsBalance"]
    c = call("POST", f"{MENTORING}/api/mentoring/sessions/{by_mentor['id']}/cancel", {"reason": "Ban dot xuat"}, token=mentor["accessToken"])
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{by_mentor['id']}/transactions", token=mentee["accessToken"])
    check("US-01", "Mentor huỷ: cancelledBy=MENTOR, hoàn 100% (REFUNDED)",
          c["cancelledBy"] == "MENTOR" and c["refundPercent"] == 100 and any(t["status"] == "REFUNDED" for t in txs), (c, txs))
    deadline = time.time() + OUTBOX_WAIT
    points = before_points
    while time.time() < deadline:
        ov = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=mentee["accessToken"])
        points = ov["pointsBalance"]
        if points >= before_points + 20:
            break
        time.sleep(5)
    check("US-01", f"Mentee nhận 20 điểm MENTOR_CANCEL_APOLOGY (outbox, chờ ≤ {OUTBOX_WAIT}s)",
          points == before_points + 20 and any(r["reason"] == "MENTOR_CANCEL_APOLOGY" for r in ov["rewards"]), (before_points, points))

    # ---------------- US-02 ----------------
    print("\nUS-02 — Strike mentor")
    for i, day in enumerate((10, 11)):
        s = book(mentee, mentor, at(day, 8))
        call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/cancel", token=mentor["accessToken"])
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=50", token=mentor["accessToken"])["items"]
    strikes = [n for n in notes if n["type"] == "MENTOR_STRIKE"]
    check("US-02", "Mỗi lần mentor huỷ được ghi 1 strike (3 thông báo)", len(strikes) == 3, [n["message"] for n in strikes])
    check("US-02", "Strike thứ 3 trong 30 ngày → mentor được báo tạm dừng", any(n["type"] == "MENTOR_PAUSED" for n in notes))
    admin_notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=100", token=admin["accessToken"])["items"]
    check("US-02", "Admin nhận thông báo MENTOR_PAUSED_STRIKES",
          any(n["type"] == "MENTOR_PAUSED_STRIKES" and mentor["userId"] in n["message"] for n in admin_notes))
    try:
        st = call("GET", f"{PROFILE}/internal/mentor/{mentor['userId']}", internal=True).get("status")
        print(f"  [INFO] profile-service status sau strike thứ 3: {st} (interface 2 của Team B; PAUSED nếu đã triển khai)")
    except ApiError as e:
        print(f"  [INFO] Không đọc được status từ profile-service: {e}")

    # ---------------- US-06 ----------------
    print("\nUS-06 — Dời lịch")
    mentor2 = approved_mentor(admin["accessToken"], "resched", 0)   # phiên miễn phí → CONFIRMED ngay
    mentee2 = accepted_mentee(mentor2, "resched")
    other2 = accepted_mentee(mentor2, "resched2")
    rs = book(mentee2, mentor2, at(4, 10))
    check("US-06", "Phiên miễn phí CONFIRMED", rs["status"] == "CONFIRMED", rs["status"])
    prop = call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/reschedule", {"newStart": at(5, 14).isoformat()},
                token=mentee2["accessToken"])
    check("US-06", "Đề xuất dời lịch PENDING, hết hạn ≤ 24h",
          prop["status"] == "PENDING" and datetime.fromisoformat(prop["expiresAt"]) <= datetime.now(VN) + timedelta(hours=24, minutes=1), prop)
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/reschedule",
                                           {"newStart": at(5, 16).isoformat()}, token=mentor2["accessToken"]))
    check("US-06", "Chỉ 1 đề xuất mở / phiên (409 RESCHEDULE_PENDING)", status == 409 and code == "RESCHEDULE_PENDING", (status, code))
    check("US-06", "Khung giờ đề xuất đang PENDING bị tính là bận với mentee khác", at(5, 14) not in slots(other2, mentor2, 60, 7))
    status, code = error_code(lambda: book(other2, mentor2, at(5, 14)))
    check("US-06", "Mentee khác không đặt được khung giờ đang được đề xuất", status == 409, (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/reschedules/{prop['id']}/accept", token=mentee2["accessToken"]))
    check("US-06", "Người đề xuất không tự chấp nhận (403)", status == 403, (status, code))
    moved = call("POST", f"{MENTORING}/api/mentoring/reschedules/{prop['id']}/accept", token=mentor2["accessToken"])
    check("US-06", "Bên kia chấp nhận → phiên chuyển giờ, giữ thời lượng/giá, rescheduleCount=1",
          datetime.fromisoformat(moved["scheduledAt"]) == at(5, 14) and moved["durationMinutes"] == 60
          and float(moved["price"]) == 0 and moved["rescheduleCount"] == 1 and moved["pendingReschedule"] is None, moved)
    p2 = call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/reschedule", {"newStart": at(6, 14).isoformat()},
              token=mentor2["accessToken"])
    d = call("POST", f"{MENTORING}/api/mentoring/reschedules/{p2['id']}/decline", token=mentee2["accessToken"])
    check("US-06", "Từ chối → DECLINED, phiên giữ giờ", d["status"] == "DECLINED"
          and datetime.fromisoformat(get_session(mentee2, rs["id"])["scheduledAt"]) == at(5, 14))
    p3 = call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/reschedule", {"newStart": at(7, 14).isoformat()},
              token=mentor2["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/reschedules/{p3['id']}/accept", token=mentee2["accessToken"])
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/reschedule",
                                           {"newStart": at(8, 14).isoformat()}, token=mentee2["accessToken"]))
    check("US-06", "Tối đa 2 lần dời (409 RESCHEDULE_LIMIT)", status == 409 and code == "RESCHEDULE_LIMIT", (status, code))

    passed = sum(1 for r in results if r[2])
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    for story, name, ok, detail in results:
        if not ok:
            print(f"  FAIL {story}: {name} {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
