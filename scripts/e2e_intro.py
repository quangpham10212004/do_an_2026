#!/usr/bin/env python3
"""
E2E — buổi làm quen (intro call) trước khi mentor nhận hẳn mentee.

Chạy khi hệ thống đang chạy (docker compose up, profile khác prod); mỗi lần tạo người dùng mới nên chạy lặp được:

    python3 scripts/e2e_intro.py

Dùng endpoint dev của mentoring-service (X-Internal-Token) để đẩy buổi làm quen sang "đã kết thúc" và chạy job xác nhận
tham dự thay vì chờ thật — cùng cách với scripts/e2e_s2_mentoring.py.
"""
import sys
import time

from common import AUTH, MENTORING, ApiError, call
from e2e_s2_mentoring import AGENDA, RUN, approved_mentor, error_code, mentee_with_profile, send_request

results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def req_url(rid, tail=""):
    return f"{MENTORING}/api/mentoring/requests/{rid}{tail}"


def respond(mentor, rid, decision, **extra):
    return call("POST", req_url(rid, "/respond"), {"decision": decision, **extra}, token=mentor["accessToken"])


def decide(user, rid, decision, note=""):
    return call("POST", req_url(rid, "/decision"), {"decision": decision, "note": note}, token=user["accessToken"])


def book_intro(mentee, rid):
    slots = call("GET", req_url(rid, "/intro-slots?days=14"), token=mentee["accessToken"])
    start = slots["slots"][3]["startAt"]
    return slots, call("POST", req_url(rid, "/intro-session"), {"scheduledAt": start}, token=mentee["accessToken"])


def hold_intro(mentor, mentee, session):
    """Kết thúc buổi làm quen và để cả hai xác nhận tham dự → COMPLETED."""
    call("POST", f"{MENTORING}/internal/dev/sessions/{session['id']}/shift", {"endedMinutesAgo": 0}, internal=True)
    call("POST", f"{MENTORING}/internal/dev/jobs/attendance", internal=True)
    for user in (mentee, mentor):
        call("POST", f"{MENTORING}/api/mentoring/sessions/{session['id']}/attendance", {"answer": "HELD"}, token=user["accessToken"])
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{session['id']}", token=mentee["accessToken"])


def request_of(user, rid):
    return next(r for r in call("GET", f"{MENTORING}/api/mentoring/requests", token=user["accessToken"]) if r["id"] == rid)


def main():
    t0 = time.time()
    print(f"E2E buổi làm quen run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    mentor = approved_mentor(admin, "intro", 0, capacity=1)  # phí 0: tập trung kiểm tra luồng làm quen
    mentee1 = mentee_with_profile("intro1")
    mentee2 = mentee_with_profile("intro2")

    print("1. Mentor mời làm quen — không chiếm sức chứa")
    r1 = send_request(mentee1, mentor)
    r2 = send_request(mentee2, mentor)
    code = error_code(lambda: call("POST", req_url(r1["id"], "/intro-session"), {"scheduledAt": "2099-01-01T10:00:00+07:00"},
                                    token=mentee1["accessToken"]))
    check("chưa INTRO thì mentee chưa đặt được buổi làm quen", code[1] == "REQUEST_NOT_INTRO", code)
    v1 = respond(mentor, r1["id"], "INTRO", note="Mình muốn trò chuyện ngắn trước nhé")
    v2 = respond(mentor, r2["id"], "INTRO")
    check("yêu cầu chuyển sang INTRO", v1["status"] == "INTRO" and v2["status"] == "INTRO")
    check("mentor capacity=1 vẫn mời được 2 mentee làm quen", v1["status"] == v2["status"] == "INTRO")
    code = error_code(lambda: call("POST", req_url(r1["id"], "/decision"), {"decision": "CONTINUE"}, token=mentee1["accessToken"]))
    check("chưa có buổi làm quen thì chưa quyết định được", code[1] == "INTRO_NOT_HELD", code)

    print("2. Đặt buổi làm quen")
    slots, s1 = book_intro(mentee1, r1["id"])
    check("khung giờ làm quen dài 15 phút, miễn phí", slots["durationMinutes"] == 15 and slots["price"] == 0 and len(slots["slots"]) > 3)
    check("buổi làm quen: INTRO · 15 phút · giá 0 · CONFIRMED",
          s1["kind"] == "INTRO" and s1["durationMinutes"] == 15 and s1["price"] == 0 and s1["status"] == "CONFIRMED", s1)
    code = error_code(lambda: book_intro(mentee1, r1["id"]))
    check("không đặt trùng buổi làm quen thứ hai", code[1] == "INTRO_ALREADY_BOOKED", code)
    code = error_code(lambda: call("POST", req_url(r1["id"], "/intro-session"), {"scheduledAt": slots["slots"][3]["startAt"]},
                                    token=mentee2["accessToken"]))
    check("mentee khác không đặt hộ được", code[0] == 403, code)
    view = request_of(mentee1, r1["id"])
    check("yêu cầu hiển thị buổi làm quen kèm trạng thái", view["intro"] and view["intro"]["sessionId"] == s1["id"]
          and view["intro"]["status"] == "CONFIRMED", view.get("intro"))
    check("mentor thấy giờ buổi làm quen", request_of(mentor, r1["id"])["intro"]["scheduledAt"] == view["intro"]["scheduledAt"])
    mine = call("GET", f"{MENTORING}/api/mentoring/sessions", token=mentee1["accessToken"])
    check("buổi làm quen nằm trong danh sách phiên", any(s["id"] == s1["id"] and s["kind"] == "INTRO" for s in mine))

    print("3. Sau buổi: xác nhận tham dự rồi mỗi bên quyết định")
    done = hold_intro(mentor, mentee1, s1)
    check("hai bên xác nhận → COMPLETED", done["status"] == "COMPLETED", done["status"])
    code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/review", {"rating": 5, "comment": "ok"},
                                    token=mentee1["accessToken"]))
    check("buổi làm quen không có đánh giá", code[1] == "INTRO_NOT_REVIEWABLE", code)
    after_mentee = decide(mentee1, r1["id"], "CONTINUE")
    check("mentee tiếp tục, chờ mentor", after_mentee["status"] == "INTRO" and after_mentee["menteeDecision"] == "CONTINUE", after_mentee["status"])
    code = error_code(lambda: decide(mentee1, r1["id"], "DECLINE"))
    check("mỗi bên chỉ quyết định một lần", code[1] == "DECISION_ALREADY_MADE", code)
    accepted = decide(mentor, r1["id"], "CONTINUE")
    check("cả hai tiếp tục → ACCEPTED", accepted["status"] == "ACCEPTED" and accepted["mentorDecision"] == "CONTINUE", accepted["status"])
    regular = call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee1["userId"], "mentorId": mentor["userId"], "scheduledAt": slots["slots"][8]["startAt"],
        "durationMinutes": 60, "sessionType": "CAREER_ADVICE", "agenda": AGENDA}, token=mentee1["accessToken"])
    check("sau khi nhận thì đặt được phiên thường", regular["kind"] == "REGULAR" and regular["status"] == "CONFIRMED", regular["status"])

    print("4. Sức chứa chỉ tính khi chính thức nhận")
    _, s2 = book_intro(mentee2, r2["id"])
    hold_intro(mentor, mentee2, s2)
    decide(mentee2, r2["id"], "CONTINUE")
    code = error_code(lambda: decide(mentor, r2["id"], "CONTINUE"))
    check("mentor đã đủ 1 mentee → không tiếp tục thêm được", code[1] == "CAPACITY_FULL", code)
    rejected = decide(mentor, r2["id"], "DECLINE", "Mình chưa còn chỗ")
    check("mentor không tiếp tục → REJECTED (lý do OTHER)", rejected["status"] == "REJECTED" and rejected["rejectReason"] == "OTHER", rejected["status"])

    print("5. Huỷ yêu cầu đang làm quen")
    mentor_b = approved_mentor(admin, "intro-b", 0, capacity=3)
    mentee3 = mentee_with_profile("intro3")
    r3 = send_request(mentee3, mentor_b)
    respond(mentor_b, r3["id"], "INTRO")
    _, s3 = book_intro(mentee3, r3["id"])
    cancelled = call("POST", req_url(r3["id"], "/cancel"), token=mentee3["accessToken"])
    s3_after = call("GET", f"{MENTORING}/api/mentoring/sessions/{s3['id']}", token=mentee3["accessToken"])
    check("huỷ yêu cầu INTRO", cancelled["status"] == "CANCELLED", cancelled["status"])
    check("buổi làm quen chưa diễn ra bị huỷ theo", s3_after["status"] == "CANCELLED", s3_after["status"])

    print("6. Quyền")
    r4 = send_request(mentee3, mentor_b)
    code = error_code(lambda: respond(mentee3, r4["id"], "INTRO"))
    check("mentee không được mời làm quen", code[0] == 403, code)

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
