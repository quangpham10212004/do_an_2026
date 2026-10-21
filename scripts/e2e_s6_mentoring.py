#!/usr/bin/env python3
"""
E2E Sprint 6 — mentoring-service: US-58 phỏng vấn thử với mentor (intake, phiếu đánh giá, nhắc / thiếu phiếu).

    python3 scripts/e2e_s6_mentoring.py [US-58]

Dùng lại helper của e2e Sprint 3 và endpoint dev (X-Internal-Token).
"""
import sys
import time

from common import AUTH, MENTORING, ApiError, call, charge
from e2e_s3_mentoring import AGENDA, CARD, RUN, accepted_mentee, approved_mentor, at, dev, error_code

results = []

INTAKE = {"interviewType": "BACKEND", "level": "FRESHER", "targetRole": "Backend Java Fresher", "targetCompany": "FPT Software",
          "jdUrl": "https://example.com/jd"}
CARD_INPUT = {"technical": 8, "problemSolving": 6, "depth": 7, "communication": 5, "liveCoding": 7, "verdict": "LEAN_NO",
              "fixes": ["Noi ro do phuc tap thuat toan truoc khi code", "Hoi lai yeu cau va rang buoc",
                        "Ke vi du du an theo cau truc STAR"],
              "privateNote": "Nen tang tot, can luyen them system design."}


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def book_mock(mentee, mentor, start, intake):
    return call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(), "durationMinutes": 60,
        "sessionType": "MOCK_INTERVIEW", "agenda": AGENDA, "mockIntake": intake}, token=mentee["accessToken"])


def mock_view(user, sid):
    return call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}/mock", token=user["accessToken"])


def submit(user, sid, body):
    return call("PUT", f"{MENTORING}/api/mentoring/sessions/{sid}/scorecard", body, token=user["accessToken"])


def session_items(user, sid):
    notes = call("GET", f"{MENTORING}/api/mentoring/sessions/{sid}/notes", token=user["accessToken"])
    return [i["text"] for i in notes["actionItems"] if i.get("sessionId") == sid]


def notification_types(user):
    res = call("GET", f"{MENTORING}/api/mentoring/notifications", token=user["accessToken"])
    return {n["type"] for n in (res if isinstance(res, list) else res.get("items", []))}


def us58(ctx):
    print("US-58 — phỏng vấn thử với mentor")
    mentor = approved_mentor(ctx["admin"]["accessToken"], "mock")
    mentee = accepted_mentee(mentor, "mock")

    status, code = error_code(lambda: book_mock(mentee, mentor, at(3, 9), None))
    check("US-58", "Đặt phỏng vấn thử thiếu intake → 400 MOCK_INTAKE_REQUIRED", status == 400 and code == "MOCK_INTAKE_REQUIRED", (status, code))
    status, code = error_code(lambda: book_mock(mentee, mentor, at(3, 9), {**INTAKE, "jdUrl": "ftp://jd"}))
    check("US-58", "Link JD không phải http(s) → 400 INVALID_JD_URL", status == 400 and code == "INVALID_JD_URL", (status, code))

    s = book_mock(mentee, mentor, at(3, 9), INTAKE)
    charge(s["id"], CARD, mentee["accessToken"])
    v = mock_view(mentee, s["id"])
    check("US-58", "Mentee thấy intake, chưa có phiếu", v["intake"]["targetRole"] == INTAKE["targetRole"] and v["scorecard"] is None
          and not v["canScore"], v)
    check("US-58", "Mentor chưa chấm được trước giờ kết thúc", not mock_view(mentor, s["id"])["canScore"])
    status, code = error_code(lambda: submit(mentor, s["id"], CARD_INPUT))
    check("US-58", "Nộp phiếu trước giờ kết thúc → 409 SESSION_NOT_ENDED", status == 409 and code == "SESSION_NOT_ENDED", (status, code))

    dev(f"sessions/{s['id']}/joined", {"mentor": True, "mentee": True})   # v2.0 §6: cả hai vào phòng, không bị coi là vắng
    dev(f"sessions/{s['id']}/shift", {"endedMinutesAgo": 5})
    dev("jobs/attendance")
    check("US-58", "Sau giờ kết thúc mentor điền được phiếu", mock_view(mentor, s["id"])["canScore"])
    status, _ = error_code(lambda: submit(mentee, s["id"], CARD_INPUT))
    check("US-58", "Mentee không nộp được phiếu → 403", status == 403, status)
    status, code = error_code(lambda: submit(mentor, s["id"], {**CARD_INPUT, "fixes": CARD_INPUT["fixes"][:2]}))
    check("US-58", "Thiếu điểm cần sửa → 400 FIXES_REQUIRED", status == 400 and code == "FIXES_REQUIRED", (status, code))

    r = submit(mentor, s["id"], CARD_INPUT)
    check("US-58", "Điểm tổng theo trọng số Backend (35/25/25/15) = 6.80", float(r["scorecard"]["overall"]) == 6.8, r["scorecard"]["overall"])
    items = session_items(mentee, s["id"])
    check("US-58", "3 điểm cần sửa thành việc cần làm của mentee", all(f in items for f in CARD_INPUT["fixes"]), items)
    check("US-58", "Mentee được báo đã có kết quả", "MOCK_SCORECARD_READY" in notification_types(mentee))
    submit(mentor, s["id"], {**CARD_INPUT, "technical": 9, "verdict": "HIRE"})
    check("US-58", "Sửa phiếu không tạo thêm việc cần làm", len(session_items(mentee, s["id"])) == len(items))
    seen = mock_view(mentee, s["id"])["scorecard"]
    check("US-58", "Mentee xem phiếu đã sửa + lời nhắn riêng", seen["verdict"] == "HIRE" and seen["privateNote"] == CARD_INPUT["privateNote"], seen)
    history = call("GET", f"{MENTORING}/api/mentoring/mock-interviews/history", token=mentee["accessToken"])
    check("US-58", "Lịch sử phỏng vấn thử của mentee có buổi này", [h["sessionId"] for h in history] == [s["id"]], history)

    s2 = book_mock(mentee, mentor, at(4, 9), {"interviewType": "SYSTEM_DESIGN", "level": "JUNIOR", "targetRole": "Backend Engineer"})
    charge(s2["id"], CARD, mentee["accessToken"])
    dev(f"sessions/{s2['id']}/joined", {"mentor": True, "mentee": True})   # v2.0 §6: cả hai vào phòng, không bị coi là vắng
    dev(f"sessions/{s2['id']}/shift", {"endedMinutesAgo": 13 * 60})
    dev("jobs/attendance")
    dev("jobs/mock-scorecard")
    check("US-58", "12 giờ sau phiên chưa có phiếu → nhắc mentor", "MOCK_SCORECARD_REMINDER" in notification_types(mentor))
    dev(f"sessions/{s2['id']}/shift", {"endedMinutesAgo": 49 * 60})
    dev("jobs/mock-scorecard")
    check("US-58", "48 giờ chưa có phiếu → đánh dấu thiếu phiếu", mock_view(mentee, s2["id"])["scorecardMissing"])
    submit(mentor, s2["id"], CARD_INPUT)
    check("US-58", "Nộp muộn (trong 7 ngày) gỡ dấu thiếu phiếu", not mock_view(mentee, s2["id"])["scorecardMissing"])

    other = accepted_mentee(mentor, "mock-other")
    status, _ = error_code(lambda: mock_view(other, s["id"]))
    check("US-58", "Mentee khác không xem được phiếu → 403", status == 403, status)


STORIES = {"US-58": us58}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 6 (mentoring) run {RUN}\n")
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
