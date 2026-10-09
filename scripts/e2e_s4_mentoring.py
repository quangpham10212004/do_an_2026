#!/usr/bin/env python3
"""
E2E Sprint 4 — Team C (mentoring-service): US-33 nhắn tin, US-34 .ics + nhắc lịch 24 h / 1 h,
US-40 ghi chú phiên + action item + ghi chú riêng của mentor.

Chạy khi hệ thống đang chạy (docker compose up, profile khác prod) — mỗi lần tạo người dùng mới nên chạy lặp được:

    python3 scripts/e2e_s4_mentoring.py [US-33 US-34 US-40]

Dùng lại các helper tạo mentor/mentee/phiên của e2e Sprint 3 và endpoint dev (X-Internal-Token) của mentoring-service.
"""
import sys
import time

from common import AUTH, MENTORING, ApiError, call
from e2e_s3_mentoring import (RUN, accepted_mentee, approved_mentor, at, book, error_code, mentee_with_profile, notes,
                              paid, send_request)

results = []


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def msg(user, conv_id, body):
    return call("POST", f"{MENTORING}/api/mentoring/conversations/{conv_id}/messages", {"body": body}, token=user["accessToken"])


def thread(user, conv_id, after=None):
    q = f"?after={after}" if after else ""
    return call("GET", f"{MENTORING}/api/mentoring/conversations/{conv_id}{q}", token=user["accessToken"])


def unread(user):
    return call("GET", f"{MENTORING}/api/mentoring/conversations/unread-count", token=user["accessToken"])["unread"]


def us33(ctx):
    print("US-33 — nhắn tin trong yêu cầu / quan hệ mentoring")
    admin = ctx["admin"]
    mentor = approved_mentor(admin["accessToken"], "msg")
    mentee = mentee_with_profile("msg")
    req = send_request(mentee, mentor)
    cid = req["id"]

    first = msg(mentee, cid, "call me 0912345678")
    check("US-33", "Tin trả về đã che SĐT trước phiên trả phí", first["body"] == "call me 09•••••••78", first["body"])
    msg(mentee, cid, "Em gửi thêm thông tin về mục tiêu")
    msg(mentee, cid, "Mong anh phản hồi sớm")
    status, code = error_code(lambda: msg(mentee, cid, "Tin thứ 4"))
    check("US-33", "Tin thứ 4 trước khi chấp nhận → 429 MESSAGE_LIMIT_BEFORE_ACCEPT",
          status == 429 and code == "MESSAGE_LIMIT_BEFORE_ACCEPT", (status, code))

    check("US-33", "Mentor thấy 3 tin chưa đọc", unread(mentor) == 3, unread(mentor))
    check("US-33", "Mentor được báo MESSAGE_RECEIVED đúng 1 lần", len(notes(mentor, "MESSAGE_RECEIVED")) == 1)
    view = thread(mentor, cid)
    check("US-33", "Mentor đọc luồng: 3 tin, SĐT bị che, contactsMasked",
          len(view["messages"]) == 3 and view["messages"][0]["body"] == "call me 09•••••••78" and view["contactsMasked"],
          [m["body"] for m in view["messages"]])
    check("US-33", "Mở luồng = đã đọc (unread 0)", unread(mentor) == 0)
    check("US-33", "Mentee còn 0 lượt trước khi được chấp nhận", thread(mentee, cid)["remainingBeforeAccept"] == 0)

    reply = msg(mentor, cid, "Chào em, anh nhận lời nhé")
    since = thread(mentee, cid, after=reply["createdAt"].replace("+", "%2B"))
    check("US-33", "Polling ?after= chỉ trả tin mới hơn mốc", since["messages"] == [], len(since["messages"]))
    call("POST", f"{MENTORING}/api/mentoring/requests/{cid}/respond", {"decision": "ACCEPT"}, token=mentor["accessToken"])
    msg(mentee, cid, "Cảm ơn anh!")
    check("US-33", "Sau khi chấp nhận mentee nhắn không giới hạn", thread(mentee, cid)["remainingBeforeAccept"] is None)

    stranger = mentee_with_profile("msg-stranger")
    status, _ = error_code(lambda: thread(stranger, cid))
    check("US-33", "Người ngoài → 403", status == 403, status)
    status, _ = error_code(lambda: thread(admin, cid))
    check("US-33", "ADMIN không đọc tin ngoài hồ sơ kiểm duyệt → 403", status == 403, status)
    inbox = call("GET", f"{MENTORING}/api/mentoring/conversations", token=mentor["accessToken"])
    check("US-33", "Hộp thư mentor có cuộc trò chuyện", any(c["id"] == cid for c in inbox))

    # Báo cáo → hồ sơ kiểm duyệt; admin xem luồng nguyên văn khi OPEN.
    rep = call("POST", f"{MENTORING}/api/mentoring/messages/{reply['id']}/report",
               {"reason": "HARASSMENT", "note": "e2e"}, token=mentee["accessToken"])
    check("US-33", "Báo cáo tin → hồ sơ OPEN", rep["status"] == "OPEN", rep)
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/messages/{reply['id']}/report",
                                           {"reason": "SPAM"}, token=mentee["accessToken"]))
    check("US-33", "Báo cáo lại khi còn mở → 409 ALREADY_REPORTED", status == 409 and code == "ALREADY_REPORTED", (status, code))
    detail = call("GET", f"{MENTORING}/api/mentoring/admin/message-reports/{rep['id']}", token=admin["accessToken"])
    raw = [m["body"] for m in detail["thread"] or []]
    check("US-33", "Người kiểm duyệt xem luồng nguyên văn khi hồ sơ OPEN", "call me 0912345678" in raw, raw)
    call("POST", f"{MENTORING}/api/mentoring/admin/message-reports/{rep['id']}/resolve",
         {"outcome": "WARNED", "note": "Giữ lịch sự"}, token=admin["accessToken"])
    closed = call("GET", f"{MENTORING}/api/mentoring/admin/message-reports/{rep['id']}", token=admin["accessToken"])
    check("US-33", "Hồ sơ đã đóng → không còn xem luồng", closed["status"] == "RESOLVED" and closed["thread"] is None)
    check("US-33", "Người gửi nhận MESSAGE_WARNING", notes(mentor, "MESSAGE_WARNING"))

    # Phiên trả phí đầu tiên được xác nhận → bỏ che SĐT.
    paid(mentee, mentor, at(5, 10))
    view = thread(mentor, cid)
    check("US-33", "Sau phiên trả phí CONFIRMED: SĐT hiện nguyên văn",
          not view["contactsMasked"] and view["messages"][0]["body"] == "call me 0912345678", view["messages"][0]["body"])


def notes_of(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}/notes", token=user["accessToken"])


def us40(ctx):
    print("US-40 — ghi chú phiên, action item mang sang phiên sau, ghi chú riêng của mentor")
    admin = ctx["admin"]
    mentor = approved_mentor(admin["accessToken"], "notes")
    mentee = accepted_mentee(mentor, "notes")
    s1 = paid(mentee, mentor, at(3, 9))
    s2 = paid(mentee, mentor, at(10, 9))

    v = call("PUT", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/notes",
             {"content": "# Chuẩn bị\n- Câu hỏi về REST", "baseVersion": 0}, token=mentee["accessToken"])
    check("US-40", "Mentee lưu ghi chú chung → version 1", v["version"] == 1, v)
    v = call("PUT", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/notes",
             {"content": "# Chuẩn bị\n- Câu hỏi về REST\n- Cache", "baseVersion": 1}, token=mentor["accessToken"])
    check("US-40", "Mentor sửa tiếp → version 2, hiện người sửa cuối", v["version"] == 2 and v["updatedBy"] == mentor["userId"], v)
    status, code = error_code(lambda: call("PUT", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/notes",
                                           {"content": "ghi đè", "baseVersion": 1}, token=mentee["accessToken"]))
    check("US-40", "Lưu với baseVersion cũ → 409 NOTES_CONFLICT", status == 409 and code == "NOTES_CONFLICT", (status, code))

    call("PUT", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/private-note", {"content": "Mentee yếu SQL"}, token=mentor["accessToken"])
    check("US-40", "Mentor đọc được ghi chú riêng", notes_of(mentor, s1["id"])["privateNote"]["content"] == "Mentee yếu SQL")
    check("US-40", "Mentee không thấy ghi chú riêng", notes_of(mentee, s1["id"])["privateNote"] is None)
    status, _ = error_code(lambda: call("PUT", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/private-note",
                                        {"content": "x"}, token=mentee["accessToken"]))
    check("US-40", "Mentee ghi ghi chú riêng → 403", status == 403, status)
    status, _ = error_code(lambda: notes_of(admin, s1["id"]))
    check("US-40", "ADMIN đọc ghi chú → 403", status == 403, status)

    item = call("POST", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/action-items",
                {"text": "Đọc chương 3 Clean Code", "owner": "MENTEE", "dueDate": at(7, 9).date().isoformat()},
                token=mentor["accessToken"])
    done_item = call("POST", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/action-items",
                     {"text": "Gửi slide", "owner": "MENTOR"}, token=mentor["accessToken"])
    check("US-40", "Mentee được báo ACTION_ITEM_ASSIGNED", notes(mentee, "ACTION_ITEM_ASSIGNED"))
    call("PATCH", f"{MENTORING}/api/mentoring/action-items/{done_item['id']}", {"done": True}, token=mentor["accessToken"])
    later = notes_of(mentee, s2["id"])["actionItems"]
    check("US-40", "Việc còn mở mang sang phiên sau (việc đã xong thì không)",
          [a["id"] for a in later] == [item["id"]] and later[0]["carriedOver"], [(a["text"], a["carriedOver"]) for a in later])
    ws = call("GET", f"{MENTORING}/api/mentoring/relationships/{mentee['requestId']}", token=mentee["accessToken"])
    check("US-40", "Không gian mentoring hiện việc còn mở", [a["id"] for a in ws["openActionItems"]] == [item["id"]],
          ws.get("openActionItems"))
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/action-items",
                                           {"text": "Việc cũ", "owner": "MENTEE", "dueDate": "2020-01-01"},
                                           token=mentee["accessToken"]))
    check("US-40", "Hạn ở quá khứ → 400 INVALID_DUE_DATE", status == 400 and code == "INVALID_DUE_DATE", (status, code))


STORIES = {"US-33": us33, "US-40": us40}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 4 Team C (mentoring) run {RUN}\n")
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
