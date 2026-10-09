#!/usr/bin/env python3
"""
E2E Sprint 4 — Team A (auth-service, email): US-39 tài khoản chưa xác thực email bị chặn gửi yêu cầu / đặt lịch /
thanh toán, gửi lại email xác thực tối đa 3 lần / giờ; US-38 email thông báo theo nhóm, giờ yên tĩnh 22:00–07:00 theo
múi giờ người nhận, gộp tin nhắn chưa đọc sau 30 phút.

    python3 scripts/e2e_s4_ai_auth.py [US-39 US-38]

Dùng endpoint dev (X-Internal-Token): auth-service GET /internal/dev/emails, /internal/dev/email-outbox,
POST /internal/dev/jobs/email-outbox; mentoring-service /internal/dev/conversations/{id}/age, /internal/dev/jobs/message-digest.
"""
import sys
import time
import uuid
from datetime import datetime, timezone

from common import AUTH, KEEP_UNVERIFIED, MENTORING, PAYMENT, PROFILE, ApiError, call
from e2e_s3_mentoring import GOAL, approved_mentor, error_code, mentee_with_profile, send_request

RUN = uuid.uuid4().hex[:6]
results = []


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def zone_at_local_hour(hour):
    """Múi giờ cố định Etc/GMT±N mà giờ địa phương hiện tại = hour (để kiểm thử giờ yên tĩnh không phụ thuộc lúc chạy)."""
    offset = (hour - datetime.now(timezone.utc).hour) % 24
    if offset > 14:
        offset -= 24
    # Etc/GMT-N = UTC+N (dấu ngược quy ước POSIX)
    return "Etc/GMT" + ("-" if offset > 0 else "+") + str(abs(offset)) if offset else "Etc/GMT"


def outbox(user_id, type_=None, wait=8.0):
    deadline = time.time() + wait
    while True:
        rows = call("GET", f"{AUTH}/internal/dev/email-outbox?userId={user_id}", internal=True)
        hit = [r for r in rows if type_ is None or r["type"] == type_]
        if hit or time.time() > deadline:
            return hit
        time.sleep(0.3)


def flush():
    return call("POST", f"{AUTH}/internal/dev/jobs/email-outbox", {}, internal=True)["sent"]


def wait_sent(user_id, type_, wait=40.0):
    """Gửi ngay rồi chờ SENT (job định kỳ 30 giây có thể đang giữ đúng dòng đó — FOR UPDATE SKIP LOCKED)."""
    deadline = time.time() + wait
    while True:
        flush()
        rows = outbox(user_id, type_)
        if (rows and rows[0]["status"] == "SENT") or time.time() > deadline:
            return rows
        time.sleep(1)


def inbox(email):
    return call("GET", f"{AUTH}/internal/dev/emails?to={email}", internal=True)


def set_tz(user, tz):
    return call("PUT", f"{PROFILE}/api/profile/{user['userId']}/timezone", {"timezone": tz}, token=user["accessToken"])


# ------------------------------------------------------------------ US-39
def us39(ctx):
    print("US-39 — tài khoản chưa xác thực email")
    mentor = ctx["mentor"]
    email = f"s4c.unverified.{RUN}@test.local"
    me = call("POST", f"{AUTH}/api/auth/register", {"email": email, "password": "Passw0rd!", "role": "MENTEE",
                                                     "fullName": "S4 Unverified"}, headers={KEEP_UNVERIFIED: "1"})
    check("US-39", "Đăng ký xong: emailVerified = false, vẫn đăng nhập được", me["emailVerified"] is False)
    call("PUT", f"{PROFILE}/api/profile/mentee/{me['userId']}", {
        "displayName": f"S4 Unverified {RUN}", "goal": GOAL, "domain": "backend", "currentLevel": "BEGINNER",
        "skills": ["Java"], "portfolioLinks": []}, token=me["accessToken"])

    status, code = error_code(lambda: send_request(me, mentor))
    check("US-39", "Gửi yêu cầu khi chưa xác thực → 403 EMAIL_NOT_VERIFIED", status == 403 and code == "EMAIL_NOT_VERIFIED", (status, code))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": me["userId"], "mentorId": mentor["userId"], "scheduledAt": "2030-01-01T10:00:00+07:00",
        "durationMinutes": 60, "sessionType": "CODE_REVIEW", "agenda": "Review kien truc REST API va service layer"},
        token=me["accessToken"]))
    check("US-39", "Đặt lịch khi chưa xác thực → 403 EMAIL_NOT_VERIFIED", status == 403 and code == "EMAIL_NOT_VERIFIED", (status, code))
    status, code = error_code(lambda: call("POST", f"{PAYMENT}/api/payment/charge", {"sessionId": str(uuid.uuid4()),
        "card": {"cardNumber": "4242 4242 4242 4242", "expiry": "12/30", "cvv": "123"}}, token=me["accessToken"],
        headers={"Idempotency-Key": str(uuid.uuid4())}))
    check("US-39", "Thanh toán khi chưa xác thực → 403 EMAIL_NOT_VERIFIED", status == 403 and code == "EMAIL_NOT_VERIFIED", (status, code))

    tokens = []
    for _ in range(3):
        tokens.append(call("POST", f"{AUTH}/api/auth/me/resend-verification", token=me["accessToken"])["emailVerificationToken"])
    status, code = error_code(lambda: call("POST", f"{AUTH}/api/auth/me/resend-verification", token=me["accessToken"]))
    check("US-39", "Gửi lại email xác thực lần thứ 4 trong 1 giờ → 429 RESEND_LIMIT", status == 429 and code == "RESEND_LIMIT", (status, code))
    verify_mails = [m for m in inbox(email) if "verify-email?token=" in m["body"]]
    check("US-39", "Đã có 4 email xác thực (đăng ký + 3 lần gửi lại)", len(verify_mails) == 4, len(verify_mails))
    status, _ = error_code(lambda: call("GET", f"{AUTH}/api/auth/verify-email?token={tokens[0]}"))
    check("US-39", "Link cũ hết hiệu lực khi đã gửi lại", status == 400, status)

    call("GET", f"{AUTH}/api/auth/verify-email?token={tokens[-1]}")
    status, code = error_code(lambda: send_request(me, mentor))
    check("US-39", "Token cũ (ev=false) vẫn bị chặn tới khi refresh", status == 403 and code == "EMAIL_NOT_VERIFIED", (status, code))
    fresh = call("POST", f"{AUTH}/api/auth/refresh", {"refreshToken": me["refreshToken"]})
    check("US-39", "Refresh sau khi xác thực → emailVerified = true", fresh["emailVerified"] is True)
    req = send_request({**me, "accessToken": fresh["accessToken"]}, mentor)
    check("US-39", "Đã xác thực → gửi yêu cầu được", req["status"] == "PENDING", req.get("status"))


# ------------------------------------------------------------------ US-38
def us38(ctx):
    print("US-38 — email thông báo: nhóm, giờ yên tĩnh, gộp tin nhắn")
    mentor = ctx["mentor"]
    prefs = call("GET", f"{AUTH}/api/auth/me/notification-preferences", token=mentor["accessToken"])
    check("US-38", "Mặc định: marketing tắt, các nhóm khác bật, giờ yên tĩnh bật",
          prefs["marketing"] is False and prefs["requests"] and prefs["sessions"] and prefs["quietHours"], prefs)
    approved = outbox(mentor["userId"], "MENTOR_APPROVED")
    check("US-38", "Kết quả AI Interview (duyệt) có email nhóm ACCOUNT", approved and approved[0]["category"] == "ACCOUNT", approved)

    # Ban ngày theo múi giờ mentor → gửi ngay.
    set_tz(mentor, zone_at_local_hour(12))
    me = mentee_with_profile("mail-day")
    req = send_request(me, mentor)
    rows = outbox(mentor["userId"], "REQUEST_RECEIVED")
    check("US-38", "Yêu cầu mới → email REQUEST_RECEIVED chờ gửi ngay", rows and rows[0]["status"] == "PENDING", rows)
    rows = wait_sent(mentor["userId"], "REQUEST_RECEIVED")
    mails = [m for m in inbox(mentor["email"]) if m["subject"].startswith("[Yêu cầu mới]")]
    check("US-38", "Job gửi email → SENT, tiêu đề mẫu '[Yêu cầu mới]'", rows[0]["status"] == "SENT" and rows[0]["subject"].startswith("[Yêu cầu mới]"), rows[0])
    check("US-38", "Email có link chi tiết + link đổi tuỳ chọn", mails and "/mentoring/requests" in mails[0]["body"]
          and "/account#notifications" in mails[0]["body"], mails[:1])

    # Tin nhắn chưa đọc sau 30 phút → 1 email gộp.
    call("POST", f"{MENTORING}/api/mentoring/conversations/{req['id']}/messages", {"body": "Chào anh, em gửi thêm thông tin"},
         token=me["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/conversations/{req['id']}/messages", {"body": "Em rảnh tối thứ Ba"},
         token=me["accessToken"])
    call("POST", f"{MENTORING}/internal/dev/jobs/message-digest", {}, internal=True)
    check("US-38", "Tin mới chưa đủ 30 phút → chưa có email gộp", not outbox(mentor["userId"], "MESSAGE_DIGEST", wait=1.5))
    call("POST", f"{MENTORING}/internal/dev/conversations/{req['id']}/age", {"minutes": 31}, internal=True)
    call("POST", f"{MENTORING}/internal/dev/jobs/message-digest", {}, internal=True)
    digest = outbox(mentor["userId"], "MESSAGE_DIGEST")
    check("US-38", "Chưa đọc sau 30 phút → 1 email gộp '2 tin nhắn'", len(digest) == 1 and "2 tin nhắn" in digest[0]["subject"], digest)
    call("POST", f"{MENTORING}/internal/dev/jobs/message-digest", {}, internal=True)
    check("US-38", "Chạy lại job không gửi trùng", len(outbox(mentor["userId"], "MESSAGE_DIGEST", wait=1.5)) == 1)

    # Giờ yên tĩnh theo múi giờ người nhận → hoãn tới 07:00.
    night = approved_mentor(ctx["admin"]["accessToken"], f"night{RUN}")
    set_tz(night, zone_at_local_hour(23))
    send_request(mentee_with_profile("mail-night"), night)
    rows = outbox(night["userId"], "REQUEST_RECEIVED")
    send_after = datetime.fromisoformat(rows[0]["sendAfter"].replace("Z", "+00:00")) if rows else None
    hours = (send_after - datetime.now(timezone.utc)).total_seconds() / 3600 if send_after else 0
    check("US-38", "23:00 giờ người nhận → email hoãn ~8 giờ tới 07:00", rows and rows[0]["status"] == "PENDING" and 7 < hours <= 8.1,
          (rows[0]["status"] if rows else None, round(hours, 2)))
    flush()
    check("US-38", "Job không gửi email đang trong giờ yên tĩnh", outbox(night["userId"], "REQUEST_RECEIVED")[0]["status"] == "PENDING")

    # Tắt nhóm "Yêu cầu" → SKIPPED.
    off = approved_mentor(ctx["admin"]["accessToken"], f"off{RUN}")
    set_tz(off, zone_at_local_hour(12))
    call("PUT", f"{AUTH}/api/auth/me/notification-preferences", {"requests": False, "sessions": True, "messages": True,
         "reviews": True, "marketing": False, "quietHours": True}, token=off["accessToken"])
    send_request(mentee_with_profile("mail-off"), off)
    rows = outbox(off["userId"], "REQUEST_RECEIVED")
    check("US-38", "Tắt nhóm Yêu cầu → email SKIPPED (PREFERENCE_OFF)", rows and rows[0]["status"] == "SKIPPED"
          and rows[0]["skipReason"] == "PREFERENCE_OFF", rows)
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications?limit=20", token=off["accessToken"])["items"]
    check("US-38", "Thông báo trong ứng dụng vẫn có", any(n["type"] == "REQUEST_RECEIVED" for n in notes))


STORIES = {"US-39": us39, "US-38": us38}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 4 auth/email run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = approved_mentor(admin["accessToken"], f"mail{RUN}")
    mentor["email"] = call("GET", f"{AUTH}/api/auth/me", token=mentor["accessToken"])["email"]
    ctx = {"admin": admin, "mentor": mentor}
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
