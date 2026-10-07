#!/usr/bin/env python3
"""
Kiểm thử end-to-end Sprint 1 của profile-service + matching-service (Thảo):

    US-07 ngoại lệ lịch rảnh · US-08 trạng thái mentor · US-04 link họp + cài đặt đặt lịch
    interface 1 (GET /internal/mentor/{id} mở rộng) · interface 2 (PUT /internal/mentor/{id}/status)
    US-08 phía matching: mentor PAUSED / ON_LEAVE / SUSPENDED không bao giờ được gợi ý.

Gọi REST API của các service đang chạy (mặc định docker compose; đổi bằng AUTH_URL, PROFILE_URL,
MATCHING_URL). Mỗi lần chạy tạo người dùng mới nên chạy lặp lại được.

    python3 scripts/e2e_p0_profile_matching.py
"""
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from common import AUTH, MATCHING, PROFILE, ApiError, call

VN = timezone(timedelta(hours=7))
RUN = uuid.uuid4().hex[:6]
DOMAIN = f"e2ep0{RUN}"  # lĩnh vực riêng của lần chạy => chỉ mentor của lần chạy này khớp
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def expect_error(fn, status, code=None):
    try:
        fn()
    except ApiError as e:
        body_code = e.body.get("error", {}).get("code") if isinstance(e.body, dict) else None
        return e.status == status and (code is None or body_code == code), (e.status, body_code)
    return False, "no error"


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {
        "email": f"e2ep0.{role.lower()}.{name}.{RUN}@test.local", "password": "Passw0rd!",
        "role": role, "fullName": f"E2E P0 {name}"})


def wait_indexed(user_id, token, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if call("GET", f"{MATCHING}/api/matching/index-status?userId={user_id}", token=token)["status"] == "UPDATED":
            return True
        time.sleep(0.5)
    return False


def main():
    t0 = time.time()
    print(f"E2E P0 profile/matching run {RUN} — profile={PROFILE} matching={MATCHING}\n")
    today = datetime.now(VN).date()

    mentor = register("MENTOR", "mentor")
    mentee = register("MENTEE", "mentee")
    mt, me = mentor["accessToken"], mentee["accessToken"]
    mid = mentor["userId"]

    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}", {
        "displayName": "E2E P0 Mentor", "skills": ["Java", "Spring Boot"], "domain": DOMAIN,
        "bio": "Backend Java mentor", "yearsExperience": 6, "hourlyRate": 0, "capacity": 3,
        "isAvailable": True, "portfolioLinks": []}, token=mt)
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/availability",
         {"slots": [{"dayOfWeek": 1, "startTime": "19:00", "endTime": "21:00"}]}, token=mt)
    call("PUT", f"{PROFILE}/internal/mentor/{mid}/verification", {"status": "APPROVED"}, internal=True)

    # ---------------- US-04 ----------------
    print("US-04 — link họp + cài đặt đặt lịch")
    settings = {"meetingLink": "https://meet.google.com/abc-defg-hij", "bufferMinutes": 30, "minNoticeHours": 24,
                "languages": ["vi", "en"], "sessionTypes": ["CODE_REVIEW", "MOCK_INTERVIEW"], "timezone": "Asia/Ho_Chi_Minh"}
    p = call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/booking-settings", settings, token=mt)
    check("Lưu cài đặt đặt lịch hợp lệ", p["bufferMinutes"] == 30 and p["minNoticeHours"] == 24
          and p["languages"] == ["vi", "en"] and p["meetingLink"] == settings["meetingLink"], p)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/booking-settings",
                                      {**settings, "meetingLink": "http://evil.example.com/x"}, token=mt), 400, "INVALID_MEETING_LINK")
    check("Link họp ngoài Meet/Zoom/Teams hoặc không https bị từ chối (400 INVALID_MEETING_LINK)", ok, d)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/booking-settings",
                                      {**settings, "bufferMinutes": 10}, token=mt), 400, "INVALID_BOOKING_SETTINGS")
    check("buffer ngoài 0/15/30 bị từ chối", ok, d)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/booking-settings",
                                      settings, token=me), 403)
    check("Người khác không sửa được cài đặt của mentor (403)", ok, d)
    public = call("GET", f"{PROFILE}/api/profile/mentor/{mid}", token=me)
    check("Mentee xem hồ sơ mentor không thấy meetingLink", public["meetingLink"] is None and public["bufferMinutes"] == 30, public.get("meetingLink"))

    # ---------------- US-07 ----------------
    print("\nUS-07 — ngoại lệ lịch rảnh")
    d1, d2 = (today + timedelta(days=3)).isoformat(), (today + timedelta(days=5)).isoformat()
    whole = call("POST", f"{PROFILE}/api/profile/mentor/{mid}/exceptions", {"date": d1, "reason": "Đi công tác"}, token=mt)
    check("Tạo ngoại lệ cả ngày (kèm warning về phiên đã xác nhận)",
          whole["exception"]["startTime"] is None and whole["warning"], whole)
    part = call("POST", f"{PROFILE}/api/profile/mentor/{mid}/exceptions",
                {"date": d2, "startTime": "19:00", "endTime": "20:00"}, token=mt)
    check("Tạo ngoại lệ một khoảng giờ (HH:mm)", part["exception"]["startTime"] == "19:00" and part["exception"]["endTime"] == "20:00", part)
    ok, d = expect_error(lambda: call("POST", f"{PROFILE}/api/profile/mentor/{mid}/exceptions",
                                      {"date": d2, "startTime": "19:30", "endTime": "21:00"}, token=mt), 409, "OVERLAPPING_EXCEPTION")
    check("Ngoại lệ trùng giờ trong cùng ngày bị từ chối (409)", ok, d)
    ok, d = expect_error(lambda: call("POST", f"{PROFILE}/api/profile/mentor/{mid}/exceptions",
                                      {"date": (today - timedelta(days=1)).isoformat()}, token=mt), 400, "INVALID_EXCEPTION")
    check("Ngoại lệ cho ngày đã qua bị từ chối (400)", ok, d)
    edited = call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/exceptions/{part['exception']['id']}",
                  {"date": d2, "startTime": "20:00", "endTime": "21:00", "reason": "Họp"}, token=mt)
    check("Sửa ngoại lệ", edited["exception"]["startTime"] == "20:00" and edited["exception"]["reason"] == "Họp", edited)
    listed = call("GET", f"{PROFILE}/api/profile/mentor/{mid}/exceptions", token=me)
    check("Danh sách ngoại lệ sắp tới (theo ngày)", [x["date"] for x in listed] == [d1, d2], listed)

    # ---------------- Interface 1 ----------------
    print("\nInterface 1 — GET /internal/mentor/{id}")
    internal = call("GET", f"{PROFILE}/internal/mentor/{mid}", internal=True)
    new_fields = {"status", "onLeaveUntil", "bufferMinutes", "minNoticeHours", "meetingLink", "timezone", "exceptions"}
    old_fields = {"userId", "displayName", "skills", "domain", "bio", "hourlyRate", "capacity", "activeMenteeCount",
                  "isAvailable", "rating", "ratingCount", "verificationStatus", "availability"}
    check("Có đủ trường mới và giữ nguyên trường cũ", new_fields | old_fields <= internal.keys(),
          sorted((new_fields | old_fields) - internal.keys()))
    check("Nội bộ thấy meetingLink, status ACCEPTING, timezone",
          internal["meetingLink"] == settings["meetingLink"] and internal["status"] == "ACCEPTING"
          and internal["timezone"] == "Asia/Ho_Chi_Minh" and internal["isAvailable"] is True, internal)
    check("exceptions 60 ngày tới đúng format {date, startTime, endTime}",
          [(x["date"], x["startTime"], x["endTime"]) for x in internal["exceptions"]] == [(d1, None, None), (d2, "20:00", "21:00")],
          internal["exceptions"])
    call("DELETE", f"{PROFILE}/api/profile/mentor/{mid}/exceptions/{whole['exception']['id']}", token=mt)
    check("Xoá ngoại lệ", len(call("GET", f"{PROFILE}/internal/mentor/{mid}", internal=True)["exceptions"]) == 1)

    # ---------------- US-08 + matching ----------------
    print("\nUS-08 — trạng thái mentor & AI Matching")
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", {
        "displayName": "E2E P0 Mentee", "goal": "Học Java Spring Boot backend", "domain": DOMAIN,
        "currentLevel": "BEGINNER", "skills": ["Java"], "portfolioLinks": []}, token=me)
    indexed = wait_indexed(mid, mt) and wait_indexed(mentee["userId"], me)
    check("Chỉ mục embedding sẵn sàng cho mentor + mentee", indexed)

    def suggested():
        res = call("GET", f"{MATCHING}/api/matching/mentors?menteeId={mentee['userId']}&limit=10", token=me)
        return any(m["mentorId"] == mid for m in res["mentors"]), res["pipeline"]["excluded"]

    check("ACCEPTING: mentor được gợi ý", suggested()[0])
    p = call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/status", {"status": "PAUSED"}, token=mt)
    shown, excluded = suggested()
    check("PAUSED: isAvailable=false và không được gợi ý (excluded.unavailable)",
          p["status"] == "PAUSED" and p["isAvailable"] is False and not shown and excluded.get("unavailable", 0) >= 1, (p["status"], excluded))
    until = (today + timedelta(days=7)).isoformat()
    p = call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/status", {"status": "ON_LEAVE", "onLeaveUntil": until}, token=mt)
    check("ON_LEAVE có onLeaveUntil và không được gợi ý", p["status"] == "ON_LEAVE" and p["onLeaveUntil"] == until and not suggested()[0], p)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/status", {"status": "ON_LEAVE"}, token=mt),
                         400, "INVALID_STATUS")
    check("ON_LEAVE thiếu ngày kết thúc bị từ chối", ok, d)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/status", {"status": "SUSPENDED"}, token=mt), 400)
    check("Mentor không tự đặt SUSPENDED được", ok, d)

    p = call("PUT", f"{PROFILE}/internal/mentor/{mid}/status", {"status": "SUSPENDED", "reason": "Tranh chấp e2e"}, internal=True)
    check("Interface 2: SUSPENDED kèm lý do", p["status"] == "SUSPENDED" and p["statusReason"] == "Tranh chấp e2e", p)
    check("SUSPENDED: không được gợi ý", not suggested()[0])
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/status", {"status": "ACCEPTING"}, token=mt),
                         409, "MENTOR_SUSPENDED")
    check("Mentor bị đình chỉ không tự gỡ được (409 MENTOR_SUSPENDED)", ok, d)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/internal/mentor/{mid}/status", {"status": "ON_LEAVE"}, internal=True), 400)
    check("Interface 2 chỉ nhận PAUSED/SUSPENDED/ACCEPTING", ok, d)
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/internal/mentor/{mid}/status", {"status": "PAUSED"}, token=mt), 403)
    check("Interface 2 yêu cầu X-Internal-Token (JWT của mentor bị 403)", ok, d)
    p = call("PUT", f"{PROFILE}/internal/mentor/{mid}/status", {"status": "ACCEPTING"}, internal=True)
    check("Interface 2: ACCEPTING gỡ đình chỉ, mentor được gợi ý lại", p["status"] == "ACCEPTING" and suggested()[0], p["status"])

    # Tương thích: cờ isAvailable cũ trong PUT hồ sơ.
    p = call("PUT", f"{PROFILE}/api/profile/mentor/{mid}", {
        "displayName": "E2E P0 Mentor", "skills": ["Java", "Spring Boot"], "domain": DOMAIN,
        "bio": "Backend Java mentor", "isAvailable": False}, token=mt)
    check("Cờ isAvailable=false cũ ánh xạ sang PAUSED", p["status"] == "PAUSED", p["status"])

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
