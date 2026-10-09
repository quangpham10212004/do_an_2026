#!/usr/bin/env python3
"""
Kiểm thử end-to-end Sprint 3 — Team B (profile-service, matching-service, không gian mentoring):

    US-27 admin tạm ngưng mentor: POST /api/profile/admin/mentors/{id}/suspend|unsuspend — tài khoản vẫn đăng
          nhập được, mentor biến mất khỏi AI Matching, phiên tương lai bị huỷ (nếu mentoring-service đã có
          POST /internal/mentors/{id}/suspend của Team A — chưa có thì in INFO, không FAIL), mentor không tự gỡ được.
    US-28 không gian mentoring: GET /api/mentoring/relationships/{id} + CRUD mục tiêu (1–5 mục tiêu, chỉ hai
          bên tham gia, admin chỉ đọc, chỉ đọc khi yêu cầu không còn ACCEPTED).

Gọi REST API của các service đang chạy (docker compose; đổi bằng AUTH_URL, PROFILE_URL, MATCHING_URL,
MENTORING_URL). Mỗi lần chạy dùng một lĩnh vực riêng nên chạy lặp lại được.

    python3 scripts/e2e_s3_profile_matching.py            # tất cả
    python3 scripts/e2e_s3_profile_matching.py us27       # một story
"""
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AUTH, MATCHING, MENTORING, PROFILE, ApiError, call

RUN = uuid.uuid4().hex[:6]
DOMAIN = f"e2es3{RUN}"
VN = timezone(timedelta(hours=7))
GOAL = ("Toi muon tro thanh backend developer trong 6 thang, nam vung Spring Boot, thiet ke REST API "
        "va trien khai microservices voi Docker.")
AGENDA = "Review cau truc du an Spring Boot va cach thiet ke REST API cho dung chuan."
results = []
infos = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def info(message):
    infos.append(message)
    print(f"  [INFO] {message}")


def error_of(fn):
    """(status, code) của lỗi, hoặc (200, None) nếu không lỗi."""
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error", {}).get("code") if isinstance(e.body, dict) else None)
    return 200, None


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {
        "email": f"e2es3.{role.lower()}.{name}.{RUN}@test.local", "password": "Passw0rd!",
        "role": role, "fullName": f"E2E S3 {name}"})


def login(email, password="Passw0rd!"):
    return call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": password})


def admin_token():
    return login("admin@mmp.local", "Admin@123")["accessToken"]


def approved_mentor(name, rate=0, bio="Backend Java mentor, Spring Boot, microservices va REST API"):
    auth = register("MENTOR", name)
    mid, token = auth["userId"], auth["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}", {
        "displayName": f"E2E S3 {name} {RUN}", "skills": ["Java", "Spring Boot"], "domain": DOMAIN, "bio": bio,
        "yearsExperience": 6, "hourlyRate": rate, "capacity": 5, "portfolioLinks": []}, token=token)
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=token)
    call("PUT", f"{PROFILE}/internal/mentor/{mid}/verification", {"status": "APPROVED"}, internal=True)
    auth["email"] = f"e2es3.mentor.{name}.{RUN}@test.local"
    return auth


def mentee_with_profile(name):
    auth = register("MENTEE", name)
    call("PUT", f"{PROFILE}/api/profile/mentee/{auth['userId']}", {
        "displayName": f"E2E S3 Mentee {name} {RUN}", "goal": GOAL, "domain": DOMAIN, "currentLevel": "BEGINNER",
        "skills": ["Java"], "portfolioLinks": []}, token=auth["accessToken"])
    return auth


def send_request(mentee, mentor):
    return call("POST", f"{MENTORING}/api/mentoring/requests", {
        "mentorId": mentor["userId"], "goal": GOAL, "sessionType": "CODE_REVIEW", "frequency": "WEEKLY",
        "expectedDurationMonths": 3, "message": "Xin chao"}, token=mentee["accessToken"])


def accept(mentor, request_id):
    return call("POST", f"{MENTORING}/api/mentoring/requests/{request_id}/respond", {"decision": "ACCEPT"},
                token=mentor["accessToken"])


def at(days, hour):
    return (datetime.now(VN) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)


def book(mentee, mentor, start):
    return call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": start.isoformat(),
        "durationMinutes": 60, "sessionType": "CODE_REVIEW", "agenda": AGENDA}, token=mentee["accessToken"])


def wait_indexed(user_id, token, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if call("GET", f"{MATCHING}/api/matching/index-status?userId={user_id}", token=token)["status"] == "UPDATED":
                return True
        except ApiError:
            pass
        time.sleep(0.5)
    return False


def suggested_ids(mentee):
    res = call("GET", f"{MATCHING}/api/matching/mentors?menteeId={mentee['userId']}&limit=20&useProfileDefaults=false",
               token=mentee["accessToken"])
    return {m["mentorId"] for m in res["mentors"]}


def similar_ids(mentee, exclude_id):
    res = call("GET", f"{MATCHING}/internal/matching/similar-mentors?menteeId={mentee['userId']}"
                      f"&excludeMentorId={exclude_id}&limit=10", internal=True)
    return {m["mentorId"] for m in res["mentors"]}


# ---------------------------------------------------------------- US-27
def us27():
    print("\nUS-27 — Admin tạm ngưng mentor")
    admin = admin_token()
    mentor = approved_mentor("susp")
    other = approved_mentor("other")
    mentee = mentee_with_profile("susp")
    for u in (mentor, other):
        wait_indexed(u["userId"], u["accessToken"])
    wait_indexed(mentee["userId"], mentee["accessToken"])
    check("Trước khi tạm ngưng: mentor có trong gợi ý AI Matching", mentor["userId"] in suggested_ids(mentee))

    # Phiên tương lai để kiểm tra mentoring-service huỷ khi tạm ngưng (mentor miễn phí => CONFIRMED ngay).
    req = send_request(mentee, mentor)
    accept(mentor, req["id"])
    session = book(mentee, mentor, at(3, 10))

    # Phân quyền + kiểm tra lý do
    status, _ = error_of(lambda: call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/suspend",
                                      {"reason": "Vi phạm quy tắc ứng xử"}, token=mentee["accessToken"]))
    check("Mentee gọi API admin → 403", status == 403, status)
    status, _ = error_of(lambda: call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/suspend",
                                      {"reason": "Vi phạm quy tắc ứng xử"}, token=mentor["accessToken"]))
    check("Mentor tự gọi API admin → 403", status == 403, status)
    status, code = error_of(lambda: call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/suspend",
                                         {"reason": "  ngắn  "}, token=admin))
    check("Lý do < 10 ký tự → 400 INVALID_SUSPEND_REASON", (status, code) == (400, "INVALID_SUSPEND_REASON"), (status, code))
    status, code = error_of(lambda: call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/suspend",
                                         {"reason": "x" * 501}, token=admin))
    check("Lý do > 500 ký tự → 400", status == 400, (status, code))
    status, code = error_of(lambda: call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/unsuspend", token=admin))
    check("Gỡ tạm ngưng mentor đang hoạt động → 409 MENTOR_NOT_SUSPENDED", (status, code) == (409, "MENTOR_NOT_SUSPENDED"), (status, code))

    # Tạm ngưng
    reason = f"Vi phạm quy tắc ứng xử nhiều lần (e2e {RUN})"
    res = call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/suspend", {"reason": reason}, token=admin)
    row = res["mentor"]
    check("Admin tạm ngưng: status SUSPENDED + suspendedReason/At", row["status"] == "SUSPENDED"
          and row["suspendedReason"] == reason and row["suspendedAt"] is not None, row)
    status, code = error_of(lambda: call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/suspend",
                                         {"reason": reason}, token=admin))
    check("Tạm ngưng lần 2 → 409 MENTOR_ALREADY_SUSPENDED", (status, code) == (409, "MENTOR_ALREADY_SUSPENDED"), (status, code))

    listed = call("GET", f"{PROFILE}/api/profile/admin/mentors?q={DOMAIN}&status=SUSPENDED", token=admin)
    check("Trang admin lọc SUSPENDED thấy mentor", [m["userId"] for m in listed["items"]] == [mentor["userId"]], listed["items"])

    # Tài khoản vẫn đăng nhập được (tách khỏi khoá tài khoản)
    try:
        relog = login(mentor["email"])
        check("Mentor bị tạm ngưng vẫn đăng nhập được", relog["userId"] == mentor["userId"])
    except ApiError as e:
        check("Mentor bị tạm ngưng vẫn đăng nhập được", False, e)

    # Hồ sơ: người khác thấy SUSPENDED nhưng không thấy lý do; chủ hồ sơ thấy lý do
    public = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentee["accessToken"])
    check("Mentee xem hồ sơ: SUSPENDED, không lộ lý do", public["status"] == "SUSPENDED" and public["statusReason"] is None
          and public["isAvailable"] is False, public["statusReason"])
    own = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor["accessToken"])
    check("Chủ hồ sơ thấy lý do tạm ngưng", own["statusReason"] == reason, own["statusReason"])

    # Mentor không tự gỡ được
    status, code = error_of(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}/status",
                                         {"status": "ACCEPTING"}, token=mentor["accessToken"]))
    check("Mentor không tự gỡ tạm ngưng (409 MENTOR_SUSPENDED)", (status, code) == (409, "MENTOR_SUSPENDED"), (status, code))
    status, _ = error_of(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}/status",
                                      {"status": "SUSPENDED"}, token=other["accessToken"]))
    check("Mentor không tự đặt SUSPENDED (400/403)", status in (400, 403), status)

    # Matching
    check("Mentor bị tạm ngưng biến mất khỏi AI Matching", mentor["userId"] not in suggested_ids(mentee))
    check("...và khỏi similar-mentors", mentor["userId"] not in similar_ids(mentee, other["userId"]))

    # Phiên tương lai (Team A)
    if res["mentoringNotified"]:
        s = call("GET", f"{MENTORING}/api/mentoring/sessions/{session['id']}", token=mentee["accessToken"])
        check("mentoring-service huỷ phiên tương lai (CANCELLED, SYSTEM)", s["status"] == "CANCELLED"
              and s.get("cancelledBy") == "SYSTEM", (s["status"], s.get("cancelledBy"), res["cancelledSessions"]))
        check("cancelledSessions ≥ 1", (res["cancelledSessions"] or 0) >= 1, res["cancelledSessions"])
    else:
        info("mentoring-service chưa có POST /internal/mentors/{id}/suspend (Team A) — phiên tương lai chưa được huỷ; "
             f"warning: {res['warning']}")

    # mentoring-service đã chặn yêu cầu mới tới mentor bị tạm ngưng (đọc status từ profile)
    mentee2 = mentee_with_profile("susp2")
    status, code = error_of(lambda: send_request(mentee2, mentor))
    check("Không gửi được yêu cầu mới tới mentor bị tạm ngưng", status in (400, 409, 422), (status, code))

    # Gỡ tạm ngưng
    res = call("POST", f"{PROFILE}/api/profile/admin/mentors/{mentor['userId']}/unsuspend", token=admin)
    check("Gỡ tạm ngưng → ACCEPTING, xoá thông tin tạm ngưng", res["mentor"]["status"] == "ACCEPTING"
          and res["mentor"]["suspendedReason"] is None and res["mentor"]["suspendedAt"] is None, res["mentor"])
    check("Sau khi gỡ: mentor xuất hiện lại trong AI Matching", mentor["userId"] in suggested_ids(mentee))


# ---------------------------------------------------------------- US-28
def us28():
    print("\nUS-28 — Không gian mentoring (mục tiêu + buổi học)")
    admin = admin_token()
    mentor = approved_mentor("ws")
    mentee = mentee_with_profile("ws")
    stranger = mentee_with_profile("wsx")
    base = f"{MENTORING}/api/mentoring/relationships"

    req = send_request(mentee, mentor)
    status, code = error_of(lambda: call("GET", f"{base}/{req['id']}", token=mentee["accessToken"]))
    check("Yêu cầu PENDING chưa có không gian → 404 RELATIONSHIP_NOT_FOUND", (status, code) == (404, "RELATIONSHIP_NOT_FOUND"), (status, code))
    accept(mentor, req["id"])
    rid = req["id"]
    session = book(mentee, mentor, at(4, 15))

    ws = call("GET", f"{base}/{rid}", token=mentee["accessToken"])
    goals = ws["goals"]
    check("Mở lần đầu: 1 mục tiêu tạo từ goal của yêu cầu", len(goals) == 1 and goals[0]["text"] == GOAL
          and goals[0]["status"] == "TODO" and goals[0]["createdBy"] is None, goals)
    check("Tóm tắt quan hệ: mentor, mentee, loại phiên, tần suất, trạng thái", ws["request"]["mentorId"] == mentor["userId"]
          and ws["request"]["menteeId"] == mentee["userId"] and ws["request"]["sessionType"] == "CODE_REVIEW"
          and ws["request"]["frequency"] == "WEEKLY" and ws["request"]["status"] == "ACCEPTED", ws["request"])
    check("Buổi học của cặp này có trong workspace", [s["id"] for s in ws["sessions"]] == [session["id"]], ws["sessions"])
    check("Mentee sửa được (canEdit, không readOnly)", ws["canEdit"] is True and ws["readOnly"] is False)
    again = call("GET", f"{base}/{rid}", token=mentor["accessToken"])
    check("Mở lại (mentor): không tạo thêm mục tiêu", len(again["goals"]) == 1 and again["canEdit"] is True, len(again["goals"]))

    # Thêm tới 5 mục tiêu (cả hai bên)
    added = []
    for i, who in enumerate([mentee, mentor, mentee, mentor]):
        added.append(call("POST", f"{base}/{rid}/goals", {"text": f"Muc tieu so {i + 2} cua e2e"}, token=who["accessToken"]))
    check("Hai bên thêm mục tiêu → tổng 5", len(call("GET", f"{base}/{rid}", token=mentee["accessToken"])["goals"]) == 5)
    status, code = error_of(lambda: call("POST", f"{base}/{rid}/goals", {"text": "Muc tieu thu sau"}, token=mentee["accessToken"]))
    check("Mục tiêu thứ 6 → 409 GOAL_LIMIT_REACHED", (status, code) == (409, "GOAL_LIMIT_REACHED"), (status, code))
    status, code = error_of(lambda: call("POST", f"{base}/{rid}/goals", {"text": "abc"}, token=mentee["accessToken"]))
    check("Nội dung < 5 ký tự → 400 INVALID_GOAL", (status, code) == (400, "INVALID_GOAL"), (status, code))

    # Sửa trạng thái / nội dung
    g = call("PUT", f"{base}/{rid}/goals/{goals[0]['id']}", {"status": "IN_PROGRESS"}, token=mentor["accessToken"])
    check("Mentor đổi trạng thái mục tiêu → IN_PROGRESS", g["status"] == "IN_PROGRESS", g)
    g = call("PUT", f"{base}/{rid}/goals/{added[0]['id']}", {"text": "Nam vung Docker Compose", "status": "DONE"},
             token=mentee["accessToken"])
    check("Mentee sửa nội dung + DONE", g["text"] == "Nam vung Docker Compose" and g["status"] == "DONE", g)

    # Sắp xếp lại
    ids = [x["id"] for x in call("GET", f"{base}/{rid}", token=mentee["accessToken"])["goals"]]
    reordered = call("PUT", f"{base}/{rid}/goals/order", {"goalIds": list(reversed(ids))}, token=mentor["accessToken"])
    check("Sắp xếp lại theo thứ tự mới", [x["id"] for x in reordered] == list(reversed(ids))
          and [x["position"] for x in reordered] == list(range(len(ids))), reordered)
    status, code = error_of(lambda: call("PUT", f"{base}/{rid}/goals/order", {"goalIds": ids[:2]}, token=mentor["accessToken"]))
    check("Thứ tự thiếu mục tiêu → 400 INVALID_GOAL_ORDER", (status, code) == (400, "INVALID_GOAL_ORDER"), (status, code))

    # Xoá xuống còn 1, không xoá được mục tiêu cuối
    current = [x["id"] for x in call("GET", f"{base}/{rid}", token=mentee["accessToken"])["goals"]]
    for gid in current[1:]:
        call("DELETE", f"{base}/{rid}/goals/{gid}", token=mentee["accessToken"])
    left = call("GET", f"{base}/{rid}", token=mentee["accessToken"])["goals"]
    check("Xoá còn 1 mục tiêu", len(left) == 1 and left[0]["position"] == 0, left)
    status, code = error_of(lambda: call("DELETE", f"{base}/{rid}/goals/{left[0]['id']}", token=mentor["accessToken"]))
    check("Xoá mục tiêu cuối cùng → 409 LAST_GOAL", (status, code) == (409, "LAST_GOAL"), (status, code))

    # Quyền
    status, _ = error_of(lambda: call("GET", f"{base}/{rid}", token=stranger["accessToken"]))
    check("Người ngoài xem → 403", status == 403, status)
    status, _ = error_of(lambda: call("POST", f"{base}/{rid}/goals", {"text": "Muc tieu nguoi ngoai"}, token=stranger["accessToken"]))
    check("Người ngoài thêm mục tiêu → 403", status == 403, status)
    seen = call("GET", f"{base}/{rid}", token=admin)
    check("Admin xem được, chỉ đọc (canEdit=false)", seen["canEdit"] is False and len(seen["goals"]) == 1, seen["canEdit"])
    status, _ = error_of(lambda: call("PUT", f"{base}/{rid}/goals/{left[0]['id']}", {"status": "DONE"}, token=admin))
    check("Admin sửa mục tiêu → 403", status == 403, status)

    # Chỉ đọc khi quan hệ không còn ACCEPTED: dùng POST /requests/{id}/end của Team A (US-31) nếu đã có,
    # không thì /complete (COMPLETED) — workspace coi mọi trạng thái khác ACCEPTED là chỉ đọc.
    try:
        call("POST", f"{MENTORING}/api/mentoring/requests/{rid}/end", {"reason": "GOAL_REACHED", "note": "e2e"},
             token=mentee["accessToken"])
        ended_with = "ENDED"
    except ApiError as e:
        if e.status not in (404, 405):
            raise
        info("POST /api/mentoring/requests/{id}/end (US-31, Team A) chưa có — kiểm tra chỉ đọc bằng /complete")
        call("POST", f"{MENTORING}/api/mentoring/requests/{rid}/complete", token=mentor["accessToken"])
        ended_with = "COMPLETED"
    ro = call("GET", f"{base}/{rid}", token=mentee["accessToken"])
    check(f"Sau khi kết thúc ({ended_with}): readOnly, vẫn xem được mục tiêu + buổi học",
          ro["readOnly"] is True and ro["canEdit"] is False and len(ro["goals"]) == 1, (ro["request"]["status"], ro["readOnly"]))
    status, code = error_of(lambda: call("POST", f"{base}/{rid}/goals", {"text": "Muc tieu sau khi ket thuc"}, token=mentee["accessToken"]))
    check("Thêm mục tiêu khi đã kết thúc → 409 RELATIONSHIP_READ_ONLY", (status, code) == (409, "RELATIONSHIP_READ_ONLY"), (status, code))
    status, code = error_of(lambda: call("PUT", f"{base}/{rid}/goals/{left[0]['id']}", {"status": "DONE"}, token=mentor["accessToken"]))
    check("Sửa mục tiêu khi đã kết thúc → 409 RELATIONSHIP_READ_ONLY", (status, code) == (409, "RELATIONSHIP_READ_ONLY"), (status, code))


STORIES = {"us27": us27, "us28": us28}


def main(selected):
    t0 = time.time()
    print(f"E2E S3 profile/matching/workspace run {RUN}")
    for name, fn in STORIES.items():
        if selected and name not in selected:
            continue
        try:
            fn()
        except Exception as e:  # lỗi bất ngờ của một story không chặn story khác
            check(f"{name}: chạy không lỗi", False, repr(e))
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} PASS, {len(infos)} INFO ({time.time() - t0:.1f}s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main([a.lower() for a in sys.argv[1:]]))
