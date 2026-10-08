#!/usr/bin/env python3
"""
Kiểm thử end-to-end cho 3 luồng đặt lịch mới: buổi làm quen, đổi lịch, gói buổi.

Chạy trên hệ thống thật (docker compose up) — cần auth, profile, mentoring, payment-service. Không cần
matching/ai/learning-service. Mỗi lần chạy tạo người dùng mới (email ngẫu nhiên) nên chạy lặp lại được.

    python3 scripts/e2e_booking_v2.py                # các kiểm tra chính
    python3 scripts/e2e_booking_v2.py --with-expiry  # thêm: gói hết hạn tự đóng và hoàn tiền (chờ tối đa ~2 phút)

Một số bước cần "dịch giờ" (buổi làm quen đã kết thúc, phiên chỉ còn vài giờ nữa): script sửa trực tiếp cột
thời gian trong mentoring_db bằng `docker compose exec`. Nếu chạy với project tên khác, đặt
COMPOSE_PROJECT_NAME=<tên>. Biến AUTH_URL/PROFILE_URL/MENTORING_URL/PAYMENT_URL đổi địa chỉ các service.
"""
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AUTH, MENTORING, PAYMENT, PROFILE, ApiError, call

VN = timezone(timedelta(hours=7))
RUN = uuid.uuid4().hex[:6]
PROJECT = os.getenv("COMPOSE_PROJECT_NAME")
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return bool(condition)


def expect_error(fn, status, code=None):
    try:
        fn()
    except ApiError as e:
        body = e.body if isinstance(e.body, dict) else {}
        got = (body.get("error") or {}).get("code")
        return e.status == status and (code is None or got == code), f"{e.status} {got}"
    return False, "không có lỗi"


def at(days, hour, minute=0):
    """Thời điểm `days` ngày nữa lúc hour:minute giờ Việt Nam."""
    t = datetime.now(VN) + timedelta(days=days)
    return t.replace(hour=hour, minute=minute, second=0, microsecond=0)


def iso(t):
    return t.isoformat()


def same(a, b):
    return datetime.fromisoformat(a) == b


def psql(service, db, statement):
    cmd = ["docker", "compose"] + (["-p", PROJECT] if PROJECT else []) + [
        "exec", "-T", service, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-tAc", statement]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"psql lỗi: {out.stderr.strip()}")
    return out.stdout.strip()


def register(role, name):
    email = f"v2.{role.lower()}.{name}.{RUN}@test.local"
    return call("POST", f"{AUTH}/api/auth/register",
                {"email": email, "password": "Passw0rd!", "role": role, "fullName": f"V2 {name}"})


def auth(user):
    return user["accessToken"]


def cards(ok=True):
    expiry = (datetime.now() + timedelta(days=900)).strftime("%m/%y")
    return {"cardNumber": "4242424242424242" if ok else "4000000000000002", "expiry": expiry, "cvv": "123"}


def get_request(token, request_id):
    return next(r for r in call("GET", f"{MENTORING}/api/mentoring/requests", token=token) if r["id"] == request_id)


def get_session(token, session_id):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{session_id}", token=token)


def mentor_active(mentor):
    return call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=auth(mentor))["activeMenteeCount"]


def package_of(token, package_id):
    return next(p for p in call("GET", f"{MENTORING}/api/mentoring/packages", token=token) if p["id"] == package_id)


def net_revenue(admin):
    return float(call("GET", f"{PAYMENT}/api/payment/admin/stats", token=auth(admin))["totalRevenue"])


def pay_session(mentee, session):
    return call("POST", f"{PAYMENT}/api/payment/charge", {"sessionId": session["id"], "card": cards()}, token=auth(mentee))


def book(mentee, mentor, when, duration=60, package_id=None):
    body = {"menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": iso(when), "durationMinutes": duration}
    if package_id:
        body["packageId"] = package_id
    return call("POST", f"{MENTORING}/api/mentoring/sessions", body, token=auth(mentee))


def setup_mentor():
    mentor = register("MENTOR", "mentor")
    call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", {
        "displayName": "V2 Mentor", "skills": ["Java", "Spring Boot"], "domain": "backend", "bio": "Mentor backend de kiem thu luong dat lich moi",
        "yearsExperience": 6, "hourlyRate": 300000, "capacity": 2, "isAvailable": True, "portfolioLinks": []}, token=auth(mentor))
    call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}/availability", {
        "slots": [{"dayOfWeek": d, "startTime": "08:00", "endTime": "22:00"} for d in range(1, 8)]}, token=auth(mentor))
    call("PUT", f"{PROFILE}/internal/mentor/{mentor['userId']}/verification", {"status": "APPROVED"}, internal=True)
    return mentor


def main():
    with_expiry = "--with-expiry" in sys.argv
    t0 = time.time()
    print(f"E2E booking v2, run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = setup_mentor()
    m1, m2 = register("MENTEE", "m1"), register("MENTEE", "m2")

    # ======================= A. Buổi làm quen =======================
    print("A — Buổi làm quen (intro call)")
    r1 = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"], "message": "Em muon duoc huong dan"}, token=auth(m1))
    r1 = call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/respond", {"decision": "INTRO"}, token=auth(mentor))
    check("Mentor đồng ý làm quen → yêu cầu ở trạng thái INTRO", r1["status"] == "INTRO")
    check("Làm quen chưa chiếm chỗ của mentor (activeMenteeCount = 0)", mentor_active(mentor) == 0)
    ok, d = expect_error(lambda: book(m1, mentor, at(3, 10)), 400, "NOT_ACCEPTED")
    check("Chưa chốt quan hệ thì chưa đặt được phiên chính thức", ok, d)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/decision", {"decision": "CONTINUE"}, token=auth(m1)), 409, "INTRO_NOT_BOOKED")
    check("Chưa đặt buổi làm quen thì chưa chọn tiếp tục được", ok, d)

    r1 = call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/intro-session", {"scheduledAt": iso(at(3, 10))}, token=auth(m1))
    intro = r1["intro"]
    check("Đặt buổi làm quen: có buổi, 15 phút, chưa mở quyết định", intro and r1["introDurationMinutes"] == 15 and not intro["decisionOpen"], r1)
    s_intro = get_session(auth(m1), intro["sessionId"])
    check("Buổi làm quen miễn phí, xác nhận ngay, loại INTRO", s_intro["type"] == "INTRO" and s_intro["status"] == "CONFIRMED" and float(s_intro["price"]) == 0, s_intro)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/intro-session", {"scheduledAt": iso(at(4, 10))}, token=auth(m1)), 409, "INTRO_ALREADY_BOOKED")
    check("Mỗi yêu cầu chỉ có một buổi làm quen đang hiệu lực", ok, d)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/decision", {"decision": "CONTINUE"}, token=auth(m1)), 409, "INTRO_NOT_FINISHED")
    check("Chỉ chọn tiếp tục/dừng được sau khi buổi làm quen kết thúc", ok, d)

    # Dịch giờ: coi như buổi làm quen đã diễn ra cách đây 1 giờ
    psql("mentoring-db", "mentoring_db", f"UPDATE sessions SET scheduled_at = now() - interval '1 hour' WHERE id = '{intro['sessionId']}'")
    r1 = get_request(auth(m1), r1["id"])
    check("Sau khi buổi kết thúc, hai bên được phép quyết định", r1["intro"]["decisionOpen"])
    r1 = call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/decision", {"decision": "CONTINUE"}, token=auth(m1))
    check("Mentee muốn tiếp tục, mới một bên nên vẫn INTRO", r1["status"] == "INTRO" and r1["menteeDecision"] == "CONTINUE", r1)
    r1 = call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/decision", {"decision": "CONTINUE"}, token=auth(mentor))
    check("Cả hai tiếp tục → quan hệ chính thức (ACCEPTED)", r1["status"] == "ACCEPTED", r1)
    check("Lúc này mới chiếm 1 chỗ của mentor", mentor_active(mentor) == 1, mentor_active(mentor))

    r2 = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"]}, token=auth(m2))
    call("POST", f"{MENTORING}/api/mentoring/requests/{r2['id']}/respond", {"decision": "INTRO"}, token=auth(mentor))
    r2 = call("POST", f"{MENTORING}/api/mentoring/requests/{r2['id']}/intro-session", {"scheduledAt": iso(at(3, 14))}, token=auth(m2))
    psql("mentoring-db", "mentoring_db", f"UPDATE sessions SET scheduled_at = now() - interval '1 hour' WHERE id = '{r2['intro']['sessionId']}'")
    r2 = call("POST", f"{MENTORING}/api/mentoring/requests/{r2['id']}/decision", {"decision": "DECLINE"}, token=auth(m2))
    check("Mentee chọn không tiếp tục → yêu cầu đóng (CANCELLED), không tốn chi phí", r2["status"] == "CANCELLED", r2)
    check("Chọn dừng không làm thay đổi sức chứa mentor", mentor_active(mentor) == 1)
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications", token=auth(mentor))
    check("Mentor nhận thông báo khi mentee không tiếp tục", any(n["type"] == "INTRO_DECLINED" for n in notes["items"]))

    # ======================= B. Đổi lịch =======================
    print("\nB — Đổi lịch")
    s = book(m1, mentor, at(3, 10))
    check("Đặt buổi lẻ 60 phút = 300.000đ, chờ thanh toán", s["status"] == "PENDING" and float(s["price"]) == 300000 and s["type"] == "REGULAR", s)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(at(4, 10))}, token=auth(m1)), 409, "SESSION_NOT_RESCHEDULABLE")
    check("Phiên chưa thanh toán không đổi lịch được", ok, d)
    pay = pay_session(m1, s)
    check("Thanh toán thành công, phiên CONFIRMED", pay["status"] == "SUCCESS" and get_session(auth(m1), s["id"])["status"] == "CONFIRMED")

    new1 = at(5, 14)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(new1)}, token=auth(m1))
    check("Mentee đổi sớm (còn nhiều hơn 24 giờ) → dời ngay", same(s["scheduledAt"], new1) and s["proposedAt"] is None and s["rescheduleCount"] == 1, s)
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{s['id']}/transactions", token=auth(m1))
    check("Đổi lịch giữ nguyên khoản đã thanh toán (1 giao dịch SUCCESS, không hoàn tiền)", len(txs) == 1 and txs[0]["status"] == "SUCCESS", txs)

    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(at(5, 23))}, token=auth(m1)), 409, "MENTOR_NOT_AVAILABLE")
    check("Giờ mới ngoài lịch rảnh của mentor bị từ chối", ok, d)
    other = book(m1, mentor, at(6, 16))   # chiếm 16:00 ngày +6 (PENDING giữ chỗ)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(at(6, 16))}, token=auth(m1)), 409)
    check("Giờ mới trùng phiên khác bị từ chối (409)", ok, d)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{other['id']}/cancel", {"reason": "don dep"}, token=auth(m1))

    new2 = at(7, 11)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(new2)}, token=auth(mentor))
    check("Mentor đề xuất đổi lịch → chưa dời, chờ mentee đồng ý", s["proposedAt"] and s["proposedBy"] == mentor["userId"] and not same(s["scheduledAt"], new2), s)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule/respond", {"accept": False}, token=auth(m1))
    check("Mentee từ chối → giữ lịch cũ, xoá đề xuất", s["proposedAt"] is None and same(s["scheduledAt"], new1), s)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(new2)}, token=auth(mentor))
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule/respond", {"accept": True}, token=auth(mentor)), 403)
    check("Người đề xuất không tự đồng ý đề xuất của mình", ok, d)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule/respond", {"accept": True}, token=auth(m1))
    check("Mentee đồng ý → dời sang giờ mentor đề xuất, không tốn lượt đổi của mentee", same(s["scheduledAt"], new2) and s["rescheduleCount"] == 1, s)

    # Còn dưới 24 giờ: dịch giờ phiên về +10 giờ nữa
    psql("mentoring-db", "mentoring_db", f"UPDATE sessions SET scheduled_at = now() + interval '10 hours' WHERE id = '{s['id']}'")
    late_target = at(8, 15)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(late_target)}, token=auth(m1))
    check("Mentee đổi muộn (dưới 24 giờ) → chỉ là đề xuất chờ mentor", s["proposedAt"] and s["proposedBy"] == m1["userId"] and not same(s["scheduledAt"], late_target), s)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule/respond", {"accept": False}, token=auth(m1))
    check("Người đề xuất rút lại được đề xuất của mình", s["proposedAt"] is None)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(late_target)}, token=auth(m1))
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule/respond", {"accept": True}, token=auth(mentor))
    check("Mentor đồng ý đề xuất muộn → dời lịch, tính 1 lượt của mentee (tổng 2)", same(s["scheduledAt"], late_target) and s["rescheduleCount"] == 2, s)
    third = at(9, 10)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(third)}, token=auth(m1))
    check("Đã dùng đủ 2 lượt tự do: lần thứ 3 dù đổi sớm cũng cần mentor đồng ý", s["proposedAt"] and not same(s["scheduledAt"], third), s)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/reschedule", {"scheduledAt": iso(at(9, 10))}, token=auth(m2)), 403)
    check("Người ngoài phiên không đổi lịch được", ok, d)
    s = call("POST", f"{MENTORING}/api/mentoring/sessions/{s['id']}/cancel", {"reason": "xong kiem thu"}, token=auth(m1))
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{s['id']}/transactions", token=auth(m1))
    check("Huỷ phiên lẻ đã trả tiền vẫn hoàn tiền như cũ (REFUNDED)", s["status"] == "CANCELLED" and txs[0]["status"] == "REFUNDED", txs)

    # ======================= C. Gói buổi =======================
    print("\nC — Gói buổi (combo)")
    opts = call("GET", f"{MENTORING}/api/mentoring/mentors/{mentor['userId']}/package-options?durationMinutes=60", token=auth(m1))
    tiers = {o["sessions"]: o for o in opts["options"]}
    check("Mức gói: 4 buổi giảm 10% (270.000đ/buổi), 8 buổi giảm 15% (255.000đ/buổi)",
          float(tiers[4]["unitPrice"]) == 270000 and float(tiers[8]["unitPrice"]) == 255000 and float(opts["singlePrice"]) == 300000, opts)
    check("Gói 4 buổi: tổng 1.080.000đ, tiết kiệm 120.000đ", float(tiers[4]["totalPrice"]) == 1080000 and float(tiers[4]["savings"]) == 120000)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/packages", {"mentorId": mentor["userId"], "sessions": 5}, token=auth(m1)), 400, "INVALID_PACKAGE_TIER")
    check("Mức gói không có trong bảng bị từ chối", ok, d)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/packages", {"mentorId": mentor["userId"], "sessions": 4}, token=auth(m2)), 400, "NOT_ACCEPTED")
    check("Chưa được mentor nhận chính thức thì không mua gói được", ok, d)

    revenue_before = net_revenue(admin)
    pack = call("POST", f"{MENTORING}/api/mentoring/packages", {"mentorId": mentor["userId"], "sessions": 4}, token=auth(m1))
    check("Mua gói 4 buổi → PENDING_PAYMENT, 4 buổi, 1.080.000đ", pack["status"] == "PENDING_PAYMENT" and pack["sessionsRemaining"] == 4 and float(pack["totalPrice"]) == 1080000, pack)
    ok, d = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/packages", {"mentorId": mentor["userId"], "sessions": 8}, token=auth(m1)), 409, "PACKAGE_PAYMENT_PENDING")
    check("Mỗi lần chỉ có một gói đang chờ thanh toán", ok, d)
    ok, d = expect_error(lambda: book(m1, mentor, at(10, 10), package_id=pack["id"]), 409, "PACKAGE_NOT_USABLE")
    check("Gói chưa thanh toán thì chưa dùng được", ok, d)
    ok, d = expect_error(lambda: call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack["id"], "amount": 1, "card": cards()}, token=auth(m1)), 400, "AMOUNT_MISMATCH")
    check("Số tiền thanh toán gói lấy từ server (client gửi sai bị từ chối)", ok, d)
    ok, d = expect_error(lambda: call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack["id"], "sessionId": s["id"], "card": cards()}, token=auth(m1)), 400, "INVALID_TARGET")
    check("Không thanh toán cùng lúc phiên và gói", ok, d)
    declined = call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack["id"], "card": cards(ok=False)}, token=auth(m1))
    check("Thẻ bị từ chối → giao dịch FAILED, gói vẫn chờ thanh toán", declined["status"] == "FAILED" and package_of(auth(m1), pack["id"])["status"] == "PENDING_PAYMENT", declined)
    paid = call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack["id"], "card": cards()}, token=auth(m1))
    pack = package_of(auth(m1), pack["id"])
    check("Thanh toán thành công → giao dịch gói SUCCESS, gói ACTIVE có hạn dùng", paid["status"] == "SUCCESS" and paid["packageId"] == pack["id"] and pack["status"] == "ACTIVE" and pack["expiresAt"], pack)
    ok, d = expect_error(lambda: call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack["id"], "card": cards()}, token=auth(m1)), 409)
    check("Gói đã kích hoạt không thanh toán lại được", ok, d)

    g1 = book(m1, mentor, at(10, 10), package_id=pack["id"])
    check("Dùng 1 buổi trong gói: CONFIRMED ngay, không thu thêm tiền", g1["status"] == "CONFIRMED" and float(g1["price"]) == 0 and g1["packageId"] == pack["id"], g1)
    check("Gói còn 3 buổi", package_of(auth(m1), pack["id"])["sessionsRemaining"] == 3)
    ok, d = expect_error(lambda: book(m1, mentor, at(10, 12), duration=90, package_id=pack["id"]), 400, "PACKAGE_DURATION_MISMATCH")
    check("Gói 60 phút không dùng cho phiên 90 phút", ok, d)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{g1['id']}/cancel", {"reason": "doi y"}, token=auth(m1))
    check("Huỷ buổi dùng gói → buổi được trả lại (còn 4), không hoàn tiền mặt", package_of(auth(m1), pack["id"])["sessionsRemaining"] == 4)
    g2 = book(m1, mentor, at(10, 14), package_id=pack["id"])
    g3 = book(m1, mentor, at(11, 14), package_id=pack["id"])
    check("Đặt 2 buổi từ gói → còn 2 buổi", package_of(auth(m1), pack["id"])["sessionsRemaining"] == 2)
    g2 = call("POST", f"{MENTORING}/api/mentoring/sessions/{g2['id']}/reschedule", {"scheduledAt": iso(at(12, 14))}, token=auth(m1))
    check("Đổi lịch buổi trong gói: giữ nguyên buổi, không mất buổi", same(g2["scheduledAt"], at(12, 14)) and package_of(auth(m1), pack["id"])["sessionsRemaining"] == 2, g2)

    cancelled = call("POST", f"{MENTORING}/api/mentoring/packages/{pack['id']}/cancel", token=auth(m1))
    check("Huỷ gói → CANCELLED, 2 buổi chưa dùng được hoàn", cancelled["status"] == "CANCELLED" and float(cancelled["refundedAmount"]) == 540000 and not cancelled["refundPending"], cancelled)
    ptx = call("GET", f"{PAYMENT}/api/payment/packages/{pack['id']}/transactions", token=auth(m1))
    check("Giao dịch gói chuyển PARTIALLY_REFUNDED, đã hoàn 540.000đ", ptx[0]["status"] == "PARTIALLY_REFUNDED" and float(ptx[0]["refundedAmount"]) == 540000, ptx)
    check("Các buổi đã đặt từ gói vẫn giữ nguyên sau khi huỷ gói", get_session(auth(m1), g3["id"])["status"] == "CONFIRMED")
    check("Doanh thu ròng chỉ tăng phần đã dùng (1.080.000 − 540.000 = 540.000đ)", abs(net_revenue(admin) - revenue_before - 540000) < 1, (revenue_before, net_revenue(admin)))
    call("POST", f"{MENTORING}/api/mentoring/sessions/{g3['id']}/cancel", {"reason": "don dep"}, token=auth(m1))
    ptx = call("GET", f"{PAYMENT}/api/payment/packages/{pack['id']}/transactions", token=auth(m1))
    check("Huỷ buổi dùng gói đã đóng → hoàn thêm đúng 1 buổi (810.000đ luỹ kế)", float(ptx[0]["refundedAmount"]) == 810000, ptx)

    # Kết thúc quan hệ → đóng gói còn hiệu lực và hoàn toàn bộ
    pack2 = call("POST", f"{MENTORING}/api/mentoring/packages", {"mentorId": mentor["userId"], "sessions": 4}, token=auth(m1))
    call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack2["id"], "card": cards()}, token=auth(m1))
    call("POST", f"{MENTORING}/api/mentoring/requests/{r1['id']}/complete", token=auth(m1))
    p2 = package_of(auth(m1), pack2["id"])
    ptx2 = call("GET", f"{PAYMENT}/api/payment/packages/{pack2['id']}/transactions", token=auth(m1))
    check("Kết thúc quan hệ mentoring → gói còn hiệu lực bị đóng, hoàn đủ 4 buổi (REFUNDED)",
          p2["status"] == "CANCELLED" and ptx2[0]["status"] == "REFUNDED" and float(ptx2[0]["refundedAmount"]) == 1080000, (p2, ptx2))
    check("Kết thúc quan hệ giải phóng chỗ của mentor", mentor_active(mentor) == 0)

    if with_expiry:
        print("\nD — Gói hết hạn tự đóng và hoàn tiền (chờ job nền, tối đa ~2 phút)")
        r3 = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"]}, token=auth(m2))
        call("POST", f"{MENTORING}/api/mentoring/requests/{r3['id']}/respond", {"decision": "ACCEPT"}, token=auth(mentor))
        pack3 = call("POST", f"{MENTORING}/api/mentoring/packages", {"mentorId": mentor["userId"], "sessions": 4}, token=auth(m2))
        call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": pack3["id"], "card": cards()}, token=auth(m2))
        psql("mentoring-db", "mentoring_db", f"UPDATE session_packages SET expires_at = now() - interval '1 minute', sessions_remaining = 3 WHERE id = '{pack3['id']}'")
        deadline = time.time() + 130
        p3 = package_of(auth(m2), pack3["id"])
        while p3["status"] == "ACTIVE" and time.time() < deadline:
            time.sleep(5)
            p3 = package_of(auth(m2), pack3["id"])
        ptx3 = call("GET", f"{PAYMENT}/api/payment/packages/{pack3['id']}/transactions", token=auth(m2))
        check("Gói quá hạn → EXPIRED, hoàn 3 buổi chưa dùng (810.000đ)", p3["status"] == "EXPIRED" and float(ptx3[0]["refundedAmount"]) == 810000, (p3, ptx3))

    passed = sum(1 for r in results if r[1])
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    failed = [r for r in results if not r[1]]
    for name, _, detail in failed:
        print(f"  FAIL: {name} {detail}")
    return 0 if not failed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
