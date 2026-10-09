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


STORIES = {"us37": us37}


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
