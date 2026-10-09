#!/usr/bin/env python3
"""
E2E Sprint 4 — Team B (profile-service, matching-service):

    US-37 điểm hoàn thiện hồ sơ (cổng AI Matching ≥ 50%), headline + ảnh đại diện, múi giờ người dùng.
    US-35 xếp hạng theo độ khớp lịch rảnh (scheduleFit) + tốc độ phản hồi; mentor < 3 đánh giá dùng điểm trung vị.
    US-36 "Không phù hợp" ẩn mentor 30 ngày kèm lý do; mỗi danh sách kết quả được ghi match_impressions.

Mỗi lần chạy dùng một lĩnh vực riêng nên chạy lặp lại được:

    python3 scripts/e2e_s4_profile_matching.py [us37 us35 us36]
"""
import sys
import time
import urllib.request
import uuid

from common import AUTH, MATCHING, MENTORING, PROFILE, ApiError, call

RUN = uuid.uuid4().hex[:6]
DOMAIN = f"e2es4{RUN}"
GOAL = ("Toi muon tro thanh backend developer trong 6 thang, nam vung Spring Boot, thiet ke REST API "
        "va trien khai microservices voi Docker.")
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
results = []


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def error_of(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error", {}).get("code") if isinstance(e.body, dict) else None)
    return 200, None


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {
        "email": f"e2es4.{role.lower()}.{name}.{RUN}@test.local", "password": "Passw0rd!",
        "role": role, "fullName": f"E2E S4 {name}"})


def mentee(name, goal=GOAL, skills=("Java",)):
    auth = register("MENTEE", name)
    call("PUT", f"{PROFILE}/api/profile/mentee/{auth['userId']}", {
        "displayName": f"E2E S4 Mentee {name} {RUN}", "goal": goal, "domain": DOMAIN, "currentLevel": "BEGINNER",
        "skills": list(skills), "portfolioLinks": []}, token=auth["accessToken"])
    return auth


def multipart(field, filename, content, mime):
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def approved_mentor(name, slots, rate=150000, bio="Backend Java mentor: Spring Boot, REST API, microservices va Docker."):
    auth = register("MENTOR", name)
    mid, token = auth["userId"], auth["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}", {
        "displayName": f"E2E S4 {name} {RUN}", "skills": ["Java", "Spring Boot", "Docker"], "domain": DOMAIN, "bio": bio,
        "yearsExperience": 6, "hourlyRate": rate, "capacity": 5, "portfolioLinks": []}, token=token)
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": a, "endTime": b} for d, a, b in slots]}, token=token)
    call("PUT", f"{PROFILE}/internal/mentor/{mid}/verification", {"status": "APPROVED"}, internal=True)
    return auth


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


def matches(mentee, limit=10):
    return call("GET", f"{MATCHING}/api/matching/mentors?menteeId={mentee['userId']}&limit={limit}&useProfileDefaults=false",
                token=mentee["accessToken"])


EVENINGS = [(d, "18:00", "22:00") for d in range(1, 8)]
MORNINGS = [(d, "07:00", "09:00") for d in range(1, 8)]
CTX = {}


def setup_ranking():
    """Hai mentor giống hệt nhau về nội dung, khác lịch rảnh; mentee muốn học buổi tối mọi ngày."""
    if CTX:
        return CTX
    evening = approved_mentor("evening", EVENINGS)
    morning = approved_mentor("morning", MORNINGS)
    rated = approved_mentor("rated", EVENINGS)
    call("PUT", f"{PROFILE}/internal/mentor/{rated['userId']}/rating", {"rating": 4.0, "ratingCount": 10}, internal=True)
    call("PUT", f"{PROFILE}/internal/mentor/{evening['userId']}/rating", {"rating": 5.0, "ratingCount": 2}, internal=True)
    me = mentee("ranker", skills=("Java", "Spring Boot", "Docker"))
    call("PUT", f"{PROFILE}/api/profile/mentee/{me['userId']}/preferences",
         {"preferredDays": [1, 2, 3, 4, 5, 6, 7], "preferredTimeOfDay": "EVENING", "budgetMaxPerHour": None, "languages": []},
         token=me["accessToken"])
    for u in (evening, morning, rated, me):
        wait_indexed(u["userId"], u["accessToken"])
    CTX.update(evening=evening, morning=morning, rated=rated, mentee=me)
    return CTX


# ---------------------------------------------------------------- US-35
def us35():
    print("\nUS-35 — xếp hạng theo độ khớp lịch, tốc độ phản hồi, cold start")
    c = setup_ranking()
    # Một mentee khác gửi yêu cầu cho mentor "evening", mentor trả lời ngay → trung vị ≈ 0 giờ.
    asker = mentee("asker")
    req = call("POST", f"{MENTORING}/api/mentoring/requests", {
        "mentorId": c["evening"]["userId"], "goal": GOAL, "sessionType": "CODE_REVIEW", "frequency": "WEEKLY",
        "expectedDurationMonths": 3, "message": "Xin chao"}, token=asker["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond",
         {"decision": "REJECT", "rejectReason": "SCHEDULE"}, token=c["evening"]["accessToken"])
    call("POST", f"{MENTORING}/internal/dev/jobs/response-time", {}, internal=True)
    prof = call("GET", f"{PROFILE}/api/profile/mentor/{c['evening']['userId']}", token=c["mentee"]["accessToken"])
    check("US-35", "mentoring đồng bộ trung vị phản hồi sang hồ sơ mentor (≈ 0 giờ)",
          prof["medianResponseHours"] is not None and float(prof["medianResponseHours"]) < 1, prof.get("medianResponseHours"))

    res = matches(c["mentee"])
    by = {m["mentorId"]: m for m in res["mentors"]}
    ev, mo, ra = (by.get(c[k]["userId"]) for k in ("evening", "morning", "rated"))
    check("US-35", "Trọng số theo PRD: 0.6/0.15/0.1/0.1/0.05",
          res["pipeline"]["weights"] == {"similarity": 0.6, "rating": 0.15, "experience": 0.1, "scheduleFit": 0.1,
                                         "responsiveness": 0.05}, res["pipeline"]["weights"])
    check("US-35", "Đủ 3 mentor trong kết quả", ev and mo and ra)
    if not (ev and mo and ra):
        return
    check("US-35", "scheduleFit: lịch tối = 1.0, lịch sáng = 0.0", ev["scheduleFit"] == 1.0 and mo["scheduleFit"] == 0.0,
          (ev["scheduleFit"], mo["scheduleFit"]))
    check("US-35", "Mentor khớp lịch xếp trên mentor lệch lịch (cùng nội dung)", ev["finalScore"] > mo["finalScore"],
          (ev["finalScore"], mo["finalScore"]))
    check("US-35", "Phản hồi ≤ 24 giờ → responsiveness 1; chưa có dữ liệu → 0.5",
          ev["responsiveness"] == 1.0 and mo["responsiveness"] == 0.5, (ev["responsiveness"], mo["responsiveness"]))
    check("US-35", "< 3 đánh giá: newMentor + rating dùng trung vị nền tảng (không phải 5.0)",
          ev["newMentor"] and ev["ratingUsed"] != 5.0, (ev["newMentor"], ev["ratingUsed"]))
    check("US-35", "≥ 3 đánh giá: dùng rating thật", not ra["newMentor"] and ra["ratingUsed"] == 4.0, (ra["newMentor"], ra["ratingUsed"]))
    check("US-35", "scoreParts cộng lại = finalScore", abs(sum(ev["scoreParts"].values()) - ev["finalScore"]) < 0.002,
          ev["scoreParts"])
    check("US-35", "Lý do có nhắc khớp lịch", any("Lịch rảnh khớp" in r for r in ev["reasons"]), ev["reasons"])


# ---------------------------------------------------------------- US-36
def us36():
    print("\nUS-36 — \"Không phù hợp\" ẩn 30 ngày + nhật ký hiển thị")
    c = setup_ranking()
    me = c["mentee"]
    res = matches(me)
    check("US-36", "Danh sách trả impressionId", bool(res.get("impressionId")), res.get("impressionId"))
    target = c["morning"]["userId"]
    rank = next((i for i, m in enumerate(res["mentors"], 1) if m["mentorId"] == target), None)
    fb = call("POST", f"{MATCHING}/api/matching/feedback", {
        "menteeId": me["userId"], "mentorId": target, "reason": "SCHEDULE", "impressionId": res["impressionId"]},
        token=me["accessToken"])
    check("US-36", "Phản hồi lưu lý do + hạng lúc bấm, ẩn tới +30 ngày", fb["reason"] == "SCHEDULE" and fb["rank"] == rank, fb)
    again = matches(me)
    check("US-36", "Mentor bị ẩn không còn trong gợi ý", target not in {m["mentorId"] for m in again["mentors"]})
    check("US-36", "pipeline.hidden = 1", again["pipeline"]["hidden"] == 1, again["pipeline"].get("hidden"))
    other = mentee("other-viewer", skills=("Java", "Spring Boot", "Docker"))
    wait_indexed(other["userId"], other["accessToken"])
    check("US-36", "Mentee khác vẫn thấy mentor đó", target in {m["mentorId"] for m in matches(other)["mentors"]})
    status, _ = error_of(lambda: call("POST", f"{MATCHING}/api/matching/feedback", {
        "menteeId": other["userId"], "mentorId": target, "reason": "OTHER"}, token=me["accessToken"]))
    check("US-36", "Ẩn hộ mentee khác → 403", status == 403, status)
    hidden = call("GET", f"{MATCHING}/api/matching/feedback?menteeId={me['userId']}", token=me["accessToken"])
    check("US-36", "Danh sách mentor đang ẩn có mentor đó", [h["mentorId"] for h in hidden] == [target], hidden)
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    stats = call("GET", f"{MATCHING}/api/matching/admin/evaluation?days=1", token=admin["accessToken"])
    row = next(r for r in stats["byRank"] if r["rank"] == rank) if rank else None
    check("US-36", "Thống kê admin: có lượt hiển thị và lượt 'Không phù hợp' ở đúng hạng",
          row and row["impressions"] >= 1 and row["notRelevant"] >= 1 and stats["reasons"].get("SCHEDULE", 0) >= 1, row)
    call("DELETE", f"{MATCHING}/api/matching/feedback/{target}?menteeId={me['userId']}", token=me["accessToken"])
    check("US-36", "Bỏ ẩn → mentor xuất hiện lại", target in {m["mentorId"] for m in matches(me)["mentors"]})


# ---------------------------------------------------------------- US-37
def us37():
    print("\nUS-37 — điểm hoàn thiện, headline + ảnh đại diện, múi giờ")
    weak = mentee("weak", goal="Hoc Java", skills=())
    p = call("GET", f"{PROFILE}/api/profile/mentee/{weak['userId']}", token=weak["accessToken"])
    check("US-37", "Mentee hồ sơ sơ sài: điểm < 50, matchingEnabled = false",
          p["completeness"]["score"] < 50 and p["matchingEnabled"] is False, p["completeness"]["score"])
    strong = mentee("strong", skills=("Java", "SQL", "Git"))
    p = call("GET", f"{PROFILE}/api/profile/mentee/{strong['userId']}", token=strong["accessToken"])
    check("US-37", "Mentee đủ lĩnh vực/trình độ/3 kỹ năng/goal ≥ 80 ký tự: 75%, bật AI Matching",
          p["completeness"]["score"] == 75 and p["matchingEnabled"], p["completeness"])
    call("PUT", f"{PROFILE}/api/profile/mentee/{strong['userId']}/preferences",
         {"preferredDays": [2, 4], "preferredTimeOfDay": "EVENING", "budgetMaxPerHour": None, "languages": []},
         token=strong["accessToken"])
    p = call("GET", f"{PROFILE}/api/profile/mentee/{strong['userId']}", token=strong["accessToken"])
    check("US-37", "Thêm lịch học mong muốn → +10%", p["completeness"]["score"] == 85, p["completeness"]["score"])

    check("US-37", "Múi giờ mặc định Asia/Ho_Chi_Minh", p["timezone"] == "Asia/Ho_Chi_Minh", p["timezone"])
    s = call("PUT", f"{PROFILE}/api/profile/{strong['userId']}/timezone", {"timezone": "Europe/Paris"}, token=strong["accessToken"])
    check("US-37", "Đổi múi giờ → Europe/Paris", s["timezone"] == "Europe/Paris", s)
    status, code = error_of(lambda: call("PUT", f"{PROFILE}/api/profile/{strong['userId']}/timezone",
                                         {"timezone": "Mars/Base"}, token=strong["accessToken"]))
    check("US-37", "Múi giờ sai → 400 INVALID_TIMEZONE", status == 400 and code == "INVALID_TIMEZONE", (status, code))
    summary = call("GET", f"{PROFILE}/internal/profile-summary/{strong['userId']}", internal=True)
    check("US-37", "profile-summary nội bộ trả timezone (mentoring dùng cho nhắc lịch)", summary.get("timezone") == "Europe/Paris", summary)
    status, _ = error_of(lambda: call("PUT", f"{PROFILE}/api/profile/{strong['userId']}/timezone",
                                      {"timezone": "UTC"}, token=weak["accessToken"]))
    check("US-37", "Đổi múi giờ của người khác → 403", status == 403, status)

    m = register("MENTOR", "headline")
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"E2E S4 Mentor {RUN}", "headline": "  Senior Backend   Engineer ", "skills": ["Java", "Spring", "SQL"],
        "domain": DOMAIN, "bio": "b" * 160, "yearsExperience": 6, "hourlyRate": 200000, "capacity": 5, "portfolioLinks": []},
         token=m["accessToken"])
    mp = call("GET", f"{PROFILE}/api/profile/mentor/{m['userId']}", token=m["accessToken"])
    check("US-37", "Headline được chuẩn hoá", mp["headline"] == "Senior Backend Engineer", mp["headline"])
    check("US-37", "Mentor chưa lịch rảnh/portfolio/ảnh: 55%", mp["completeness"]["score"] == 55, mp["completeness"]["score"])
    body, ctype = multipart("file", "a.png", PNG, "image/png")
    res = call("PUT", f"{PROFILE}/api/profile/{m['userId']}/avatar", token=m["accessToken"], raw_body=body, content_type=ctype)
    check("US-37", "Tải ảnh PNG → avatarUrl có ?v=", "/api/profile/avatars/" in res["avatarUrl"] and "?v=" in res["avatarUrl"], res)
    with urllib.request.urlopen(f"{PROFILE}{res['avatarUrl']}", timeout=10) as r:
        check("US-37", "Ảnh đại diện tải công khai, đúng content-type", r.headers["Content-Type"] == "image/png" and r.read() == PNG)
    mp = call("GET", f"{PROFILE}/api/profile/mentor/{m['userId']}", token=m["accessToken"])
    check("US-37", "Có ảnh → +10% (65%)", mp["completeness"]["score"] == 65, mp["completeness"]["score"])
    other = call("GET", f"{PROFILE}/api/profile/mentor/{m['userId']}", token=strong["accessToken"])
    check("US-37", "Người xem khác không thấy completeness", other["completeness"] is None and other["headline"])
    body, ctype = multipart("file", "a.gif", b"GIF89a....", "image/png")
    status, code = error_of(lambda: call("PUT", f"{PROFILE}/api/profile/{m['userId']}/avatar", token=m["accessToken"],
                                         raw_body=body, content_type=ctype))
    check("US-37", "File không phải JPG/PNG (dù khai image/png) → 400 INVALID_AVATAR", status == 400 and code == "INVALID_AVATAR", (status, code))


STORIES = {"us37": us37, "us35": us35, "us36": us36}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 4 Team B (profile/matching) run {RUN}, domain {DOMAIN}")
    for name, fn in STORIES.items():
        if not selected or name in selected:
            fn()
    passed = sum(1 for r in results if r[2])
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    for story, name, ok, detail in results:
        if not ok:
            print(f"  FAIL {story}: {name} {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main({a.lower() for a in sys.argv[1:]}))
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
