#!/usr/bin/env python3
"""
E2E — gói buổi (combo): mua, thanh toán (Idempotency-Key + phí nền tảng), đặt phiên bằng gói, trả buổi khi huỷ/mentor
vắng, hoàn tiền buổi chưa dùng khi huỷ gói / hết hạn / kết thúc quan hệ, và đặt song song không dùng quá số buổi.

Chạy khi hệ thống đang chạy (docker compose up, profile khác prod); mỗi lần tạo người dùng mới nên chạy lặp được:

    python3 scripts/e2e_packages.py

Dùng endpoint dev của mentoring-service (X-Internal-Token) để dời hạn gói / chạy job thay vì chờ thật.
"""
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta

from common import AUTH, MENTORING, PAYMENT, ApiError, call
from e2e_s2_mentoring import AGENDA, CARD, RUN, VN, accepted_mentee, approved_mentor, at, error_code, mentee_with_profile, send_request

results = []
RATE = 300000  # đ/giờ → buổi 60 phút = 300.000đ; gói 4 buổi giảm 10% = 270.000đ/buổi


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def api(method, path, body=None, token=None, **kw):
    return call(method, f"{MENTORING}/api/mentoring{path}", body, token=token, **kw)


def pay_package(mentee, package_id, key=None):
    return call("POST", f"{PAYMENT}/api/payment/charge", {"packageId": package_id, "card": CARD}, token=mentee["accessToken"],
                headers={"Idempotency-Key": key or str(uuid.uuid4())})


def package_tx(user, package_id):
    return call("GET", f"{PAYMENT}/api/payment/packages/{package_id}/transactions", token=user["accessToken"])


def my_package(mentee, package_id):
    return next(p for p in api("GET", "/packages", token=mentee["accessToken"]) if p["id"] == package_id)


def buy_active_package(mentee, mentor, sessions=4):
    pkg = api("POST", "/packages", {"mentorId": mentor["userId"], "sessions": sessions, "durationMinutes": 60}, token=mentee["accessToken"])
    pay_package(mentee, pkg["id"])
    return my_package(mentee, pkg["id"])


def book_with_package(mentee, mentor, package_id, start):
    return api("POST", "/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(), "durationMinutes": 60,
        "sessionType": "CODE_REVIEW", "agenda": AGENDA, "packageId": package_id}, token=mentee["accessToken"])


def main():
    t0 = time.time()
    print(f"E2E gói buổi run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    mentor = approved_mentor(admin["accessToken"], "pkg", RATE, capacity=5)
    mentee = accepted_mentee(mentor, "pkg")
    tok = mentee["accessToken"]

    print("1. Xem và mua gói")
    opts = api("GET", f"/mentors/{mentor['userId']}/package-options?durationMinutes=60", token=tok)
    unit4, unit8 = opts["options"][0]["unitPrice"], opts["options"][1]["unitPrice"]
    check("giá lẻ 300.000đ, 2 mức gói 4 và 8 buổi", opts["singlePrice"] == RATE and [o["sessions"] for o in opts["options"]] == [4, 8], opts)
    check("gói 4 buổi giảm 10% (270.000đ/buổi), gói 8 buổi giảm 15% (255.000đ/buổi)", unit4 == 270000 and unit8 == 255000, (unit4, unit8))
    check("tiết kiệm so với mua lẻ: 4 buổi → 120.000đ", opts["options"][0]["savings"] == 120000)
    code = error_code(lambda: api("POST", "/packages", {"mentorId": mentor["userId"], "sessions": 5}, token=tok))
    check("mức gói không có trong cấu hình bị từ chối", code[0] == 400 and code[1] == "INVALID_PACKAGE_TIER", code)
    stranger_mentor = approved_mentor(admin["accessToken"], "pkg2", RATE, capacity=5)
    code = error_code(lambda: api("POST", "/packages", {"mentorId": stranger_mentor["userId"], "sessions": 4}, token=tok))
    check("chưa được mentor nhận thì chưa mua được gói", code[1] == "NOT_ACCEPTED", code)

    pkg = api("POST", "/packages", {"mentorId": mentor["userId"], "sessions": 4, "durationMinutes": 60}, token=tok)
    check("tạo gói: PENDING_PAYMENT, 4/4 buổi, tổng 1.080.000đ", pkg["status"] == "PENDING_PAYMENT" and pkg["sessionsRemaining"] == 4
          and pkg["totalPrice"] == 1080000, pkg)
    code = error_code(lambda: api("POST", "/packages", {"mentorId": mentor["userId"], "sessions": 8}, token=tok))
    check("đang có một gói chờ thanh toán thì chưa mua thêm", code[1] == "PACKAGE_PAYMENT_PENDING", code)
    code = error_code(lambda: book_with_package(mentee, mentor, pkg["id"], at(4, 10)))
    check("gói chưa thanh toán không đặt phiên được", code[1] == "PACKAGE_NOT_USABLE", code)

    print("2. Thanh toán gói")
    key = str(uuid.uuid4())
    t1 = pay_package(mentee, pkg["id"], key)
    check("thanh toán thành công, giao dịch gắn với gói (không có sessionId)", t1["status"] == "SUCCESS" and t1["packageId"] == pkg["id"]
          and t1["sessionId"] is None, t1)
    check("phí nền tảng 15% chốt lúc thu: 162.000đ, mentor nhận 918.000đ", t1["fee"] == 162000 and t1["mentorEarning"] == 918000, t1)
    t1b = pay_package(mentee, pkg["id"], key)
    check("gửi lại cùng Idempotency-Key trả đúng giao dịch cũ", t1b["id"] == t1["id"], t1b)
    code = error_code(lambda: pay_package(mentee, pkg["id"]))
    check("gói đã thanh toán không thanh toán lần hai", code[1] in ("ALREADY_PAID", "PACKAGE_NOT_PAYABLE"), code)
    active = my_package(mentee, pkg["id"])
    check("gói ACTIVE, còn 4 buổi, có hạn dùng", active["status"] == "ACTIVE" and active["sessionsRemaining"] == 4 and active["expiresAt"], active)
    mentor_txs = call("GET", f"{PAYMENT}/api/payment/transactions", token=mentor["accessToken"])
    check("mentor thấy khoản thu của gói trong giao dịch", any(t["packageId"] == pkg["id"] for t in mentor_txs))

    print("3. Đặt phiên bằng gói")
    s1 = book_with_package(mentee, mentor, pkg["id"], at(6, 10))
    s2 = book_with_package(mentee, mentor, pkg["id"], at(7, 10))
    check("phiên dùng gói: CONFIRMED, giá 0, gắn packageId", s1["status"] == "CONFIRMED" and s1["price"] == 0 and s1["packageId"] == pkg["id"], s1)
    check("còn 2/4 buổi", my_package(mentee, pkg["id"])["sessionsRemaining"] == 2)
    code = error_code(lambda: api("POST", "/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": at(8, 10).isoformat(), "durationMinutes": 90,
        "sessionType": "CODE_REVIEW", "agenda": AGENDA, "packageId": pkg["id"]}, token=tok))
    check("thời lượng khác thời lượng của gói bị từ chối", code[1] == "PACKAGE_DURATION_MISMATCH", code)
    other = accepted_mentee(mentor, "pkg-other")
    code = error_code(lambda: book_with_package(other, mentor, pkg["id"], at(8, 11)))
    check("mentee khác không dùng được gói của người khác", code[0] in (403, 409), code)

    print("4. Huỷ phiên dùng gói theo chính sách của Thắng")
    preview = api("GET", f"/sessions/{s1['id']}/cancel-preview", token=tok)
    check("xem trước: huỷ ≥72 giờ → trả lại buổi, không có tiền hoàn riêng",
          preview["refundPercent"] == 100 and preview["refundAmount"] == 0 and "gói" in preview["policyText"], preview)
    api("POST", f"/sessions/{s1['id']}/cancel", {"reason": "Bận việc"}, token=tok)
    check("huỷ sớm → trả lại 1 buổi (còn 3)", my_package(mentee, pkg["id"])["sessionsRemaining"] == 3)
    late = book_with_package(mentee, mentor, pkg["id"], at(2, 14))
    check("còn 2 buổi sau khi đặt phiên trong 72 giờ tới", my_package(mentee, pkg["id"])["sessionsRemaining"] == 2)
    api("POST", f"/sessions/{late['id']}/cancel", {"reason": "Muộn"}, token=tok)
    check("huỷ muộn (<72 giờ) → buổi vẫn bị tính là đã dùng (còn 2)", my_package(mentee, pkg["id"])["sessionsRemaining"] == 2)
    api("POST", f"/sessions/{s2['id']}/cancel", {"reason": "Mentor huỷ"}, token=mentor["accessToken"])
    check("mentor huỷ → trả lại buổi (còn 3)", my_package(mentee, pkg["id"])["sessionsRemaining"] == 3)

    print("5. Huỷ gói: hoàn tiền buổi chưa dùng")
    cancelled = api("POST", f"/packages/{pkg['id']}/cancel", token=tok)
    txs = package_tx(mentee, pkg["id"])
    check("huỷ gói → CANCELLED, không còn buổi", cancelled["status"] == "CANCELLED" and cancelled["sessionsRemaining"] == 0, cancelled)
    check("hoàn 3 buổi × 270.000đ = 810.000đ, giao dịch PARTIALLY_REFUNDED",
          txs[0]["refundedAmount"] == 810000 and txs[0]["status"] == "PARTIALLY_REFUNDED", txs[0])
    check("khoản hoàn ghi riêng trong bảng refunds (không ghi đè giao dịch)", len(txs[0]["refunds"]) == 1 and txs[0]["refunds"][0]["amount"] == 810000)
    view = my_package(mentee, pkg["id"])
    check("gói ghi nhận đã hoàn đủ, không còn chờ hoàn", view["refundedAmount"] == 810000 and not view["refundPending"], view)
    code = error_code(lambda: api("POST", f"/packages/{pkg['id']}/cancel", token=tok))
    check("gói đã đóng không huỷ lại được", code[1] == "PACKAGE_NOT_CANCELLABLE", code)

    print("6. Trả buổi vào gói đã đóng → hoàn thêm tiền")
    pkg2 = buy_active_package(mentee, mentor, 4)
    keep = book_with_package(mentee, mentor, pkg2["id"], at(10, 10))
    api("POST", f"/packages/{pkg2['id']}/cancel", token=tok)  # còn 3 buổi chưa dùng → hoàn 810.000đ; phiên `keep` vẫn còn
    after_close = package_tx(mentee, pkg2["id"])[0]
    check("đóng gói còn phiên đã đặt: hoàn 3 buổi chưa dùng", after_close["refundedAmount"] == 810000, after_close)
    api("POST", f"/sessions/{keep['id']}/cancel", {"reason": "Không học nữa"}, token=tok)
    final_tx = package_tx(mentee, pkg2["id"])[0]
    check("huỷ nốt phiên đã đặt → hoàn thêm 1 buổi, tổng 1.080.000đ, giao dịch REFUNDED",
          final_tx["refundedAmount"] == 1080000 and final_tx["status"] == "REFUNDED", final_tx)

    print("7. Hết hạn dùng")
    pkg3 = buy_active_package(mentee, mentor, 4)
    book_with_package(mentee, mentor, pkg3["id"], at(11, 10))
    call("POST", f"{MENTORING}/internal/dev/packages/{pkg3['id']}/shift", {"expiredDaysAgo": 1}, internal=True)
    code = error_code(lambda: book_with_package(mentee, mentor, pkg3["id"], at(12, 10)))
    check("gói quá hạn không đặt thêm được", code[1] == "PACKAGE_NOT_USABLE", code)
    call("POST", f"{MENTORING}/internal/dev/jobs/package-expiry", internal=True)
    expired = my_package(mentee, pkg3["id"])
    tx3 = package_tx(mentee, pkg3["id"])[0]
    check("job đóng gói quá hạn → EXPIRED và hoàn 3 buổi chưa dùng (810.000đ)", expired["status"] == "EXPIRED" and tx3["refundedAmount"] == 810000, (expired["status"], tx3["refundedAmount"]))
    call("POST", f"{MENTORING}/internal/dev/jobs/package-expiry", internal=True)
    check("chạy job lần nữa không hoàn trùng", package_tx(mentee, pkg3["id"])[0]["refundedAmount"] == 810000)

    print("8. Kết thúc quan hệ mentoring")
    pkg4 = buy_active_package(mentee, mentor, 4)
    rel = next(r for r in api("GET", "/requests", token=tok) if r["mentorId"] == mentor["userId"] and r["status"] == "ACCEPTED")
    api("POST", f"/requests/{rel['id']}/complete", token=tok)
    ended = my_package(mentee, pkg4["id"])
    tx4 = package_tx(mentee, pkg4["id"])[0]
    check("kết thúc mentoring → gói bị đóng và hoàn toàn bộ 4 buổi chưa dùng", ended["status"] == "CANCELLED" and tx4["refundedAmount"] == 1080000
          and tx4["status"] == "REFUNDED", (ended["status"], tx4["status"], tx4["refundedAmount"]))

    print("9. Đặt song song không dùng quá số buổi")
    mentee2 = accepted_mentee(mentor, "pkg-race")
    pkg5 = buy_active_package(mentee2, mentor, 4)
    for d in (13, 14, 15):
        book_with_package(mentee2, mentor, pkg5["id"], at(d, 10))  # còn đúng 1 buổi
    outcomes = []

    def race(day):
        try:
            book_with_package(mentee2, mentor, pkg5["id"], at(day, 14))
            outcomes.append("OK")
        except ApiError as e:
            outcomes.append(e.body.get("error", {}).get("code") if isinstance(e.body, dict) else str(e.status))

    threads = [threading.Thread(target=race, args=(d,)) for d in (16, 17, 18, 19)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    final = my_package(mentee2, pkg5["id"])
    check("4 yêu cầu đồng thời với 1 buổi còn lại: đúng 1 thành công", outcomes.count("OK") == 1 and outcomes.count("PACKAGE_NOT_USABLE") == 3, outcomes)
    check("gói hết buổi → EXHAUSTED", final["status"] == "EXHAUSTED" and final["sessionsRemaining"] == 0, final)

    print("10. Quyền")
    code = error_code(lambda: api("POST", "/packages", {"mentorId": mentor["userId"], "sessions": 4}, token=mentor["accessToken"]))
    check("mentor không mua gói", code[0] == 403, code)
    code = error_code(lambda: api("POST", f"/packages/{pkg5['id']}/cancel", token=other["accessToken"]))
    check("người khác không huỷ được gói", code[0] == 403, code)
    leaked = call("GET", f"{PAYMENT}/api/payment/packages/{pkg5['id']}/transactions", token=other["accessToken"])
    check("danh sách giao dịch của gói người khác rỗng", leaked == [], leaked)

    passed = sum(1 for r in results if r[1])
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    for name, ok, detail in results:
        if not ok:
            print(f"  FAIL: {name} {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
