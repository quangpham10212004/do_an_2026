#!/usr/bin/env python3
"""
Kiểm thử end-to-end Sprint 2 của profile-service + matching-service (Thảo):

    US-16 sở thích tìm mentor của mentee (PUT /api/profile/mentee/{id}/preferences)
    US-17 bộ lọc AI Matching áp dụng TRƯỚC khi xếp hạng vector, mặc định lấy từ hồ sơ, ghi đè theo lượt
    US-18 excludedBy — số mentor mỗi bộ lọc loại riêng (để "Nới điều kiện")
    Interface cho mentoring-service (US-15): GET /internal/matching/similar-mentors

Gọi REST API của các service đang chạy (mặc định docker compose; đổi bằng AUTH_URL, PROFILE_URL,
MATCHING_URL). Mỗi lần chạy dùng một lĩnh vực riêng nên chỉ mentor của lần chạy này khớp; chạy lặp lại được.

    python3 scripts/e2e_s2_profile_matching.py
"""
import sys
import time
import urllib.parse
import uuid

from common import AUTH, MATCHING, PROFILE, ApiError, call

RUN = uuid.uuid4().hex[:6]
DOMAIN = f"e2es2{RUN}"
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
        "email": f"e2es2.{role.lower()}.{name}.{RUN}@test.local", "password": "Passw0rd!",
        "role": role, "fullName": f"E2E S2 {name}"})


def create_mentor(name, rate, slots, languages=("vi",), session_types=None, bio="Backend Java mentor"):
    auth = register("MENTOR", name)
    mid, token = auth["userId"], auth["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}", {
        "displayName": f"E2E S2 {name}", "skills": ["Java", "Spring Boot"], "domain": DOMAIN, "bio": bio,
        "yearsExperience": 5, "hourlyRate": rate, "capacity": 3, "portfolioLinks": []}, token=token)
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": s, "endTime": e} for d, s, e in slots]}, token=token)
    call("PUT", f"{PROFILE}/api/profile/mentor/{mid}/booking-settings", {
        "bufferMinutes": 15, "minNoticeHours": 12, "languages": list(languages),
        "sessionTypes": list(session_types or ["CAREER_ADVICE", "CODE_REVIEW", "MOCK_INTERVIEW", "PROJECT_GUIDANCE"]),
        "timezone": "Asia/Ho_Chi_Minh"}, token=token)
    call("PUT", f"{PROFILE}/internal/mentor/{mid}/verification", {"status": "APPROVED"}, internal=True)
    return {"id": mid, "token": token, "rate": rate}


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


def main():
    t0 = time.time()
    print(f"E2E S2 profile/matching run {RUN} — profile={PROFILE} matching={MATCHING}\n")

    mentee = register("MENTEE", "mentee")
    me, mentee_id = mentee["accessToken"], mentee["userId"]
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee_id}", {
        "displayName": "E2E S2 Mentee", "goal": "Học Java Spring Boot backend", "domain": DOMAIN,
        "currentLevel": "BEGINNER", "skills": ["Java"], "portfolioLinks": []}, token=me)

    # ---------------- US-16 ----------------
    print("US-16 — sở thích tìm mentor")
    p = call("GET", f"{PROFILE}/api/profile/mentee/{mentee_id}", token=me)
    check("Mặc định không có sở thích", p["preferredDays"] == [] and p["preferredTimeOfDay"] is None
          and p["budgetMaxPerHour"] is None and p["languages"] == [], p)
    prefs = {"preferredDays": [6, 1], "preferredTimeOfDay": "evening", "budgetMaxPerHour": 150000, "languages": ["VI"]}
    p = call("PUT", f"{PROFILE}/api/profile/mentee/{mentee_id}/preferences", prefs, token=me)
    check("Lưu sở thích (ngày ISO sắp tăng dần, buổi/ngôn ngữ chuẩn hoá)",
          p["preferredDays"] == [1, 6] and p["preferredTimeOfDay"] == "EVENING"
          and float(p["budgetMaxPerHour"]) == 150000 and p["languages"] == ["vi"], p)
    p = call("GET", f"{PROFILE}/api/profile/mentee/{mentee_id}", token=me)
    check("Đọc lại hồ sơ thấy sở thích", p["preferredDays"] == [1, 6] and p["preferredTimeOfDay"] == "EVENING", p)
    for bad, label in (({"preferredDays": [0]}, "ngày 0"), ({"preferredDays": [8]}, "ngày 8"),
                       ({"preferredTimeOfDay": "NIGHT"}, "buổi lạ"), ({"budgetMaxPerHour": -1}, "ngân sách âm"),
                       ({"languages": ["fr"]}, "ngôn ngữ fr")):
        ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentee/{mentee_id}/preferences", bad, token=me),
                             400, "INVALID_PREFERENCES")
        check(f"Từ chối {label} (400 INVALID_PREFERENCES)", ok, d)
    other = register("MENTEE", "other")
    ok, d = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentee/{mentee_id}/preferences",
                                      prefs, token=other["accessToken"]), 403)
    check("Mentee khác không sửa được sở thích (403)", ok, d)

    # ---------------- Dữ liệu cho US-17/18 ----------------
    print("\nTạo 36 mentor (30 giá ≤ 150.000đ, 6 giá 300.000đ) ...")
    evening_mon = [(1, "19:00", "21:00")]
    cheap = [create_mentor(f"cheap{i}", 100000 if i % 2 else 150000, evening_mon) for i in range(28)]
    sat_morning = create_mentor("satmorning", 120000, [(6, "08:00", "10:00")])
    english = create_mentor("english", 0, evening_mon, languages=("en",), session_types=["MOCK_INTERVIEW"])
    pricey = [create_mentor(f"pricey{i}", 300000, evening_mon) for i in range(6)]
    mentors = cheap + [sat_morning, english] + pricey
    indexed = all(wait_indexed(m["id"], m["token"]) for m in mentors) and wait_indexed(mentee_id, me)
    check("Chỉ mục embedding sẵn sàng cho 36 mentor + mentee", indexed)
    rate_of = {m["id"]: m["rate"] for m in mentors}

    def search(**params):
        query = [("menteeId", mentee_id)]
        for k, v in params.items():
            for item in (v if isinstance(v, list) else [v]):
                query.append((k, str(item).lower() if isinstance(item, bool) else str(item)))
        return call("GET", f"{MATCHING}/api/matching/mentors?{urllib.parse.urlencode(query)}", token=me)

    # ---------------- US-17 ----------------
    print("\nUS-17 — bộ lọc trước khi xếp hạng")
    res = search(limit=10, maxRate=150000, useProfileDefaults=False)
    over = [m for m in res["mentors"] if m["hourlyRate"] > 150000]
    check("AC: maxRate=150000 => không kết quả nào có hourlyRate > 150.000", res["mentors"] and not over,
          [m["hourlyRate"] for m in res["mentors"]])
    check("AC: 30 mentor hợp lệ, limit=10 => đúng 10 kết quả",
          res["pipeline"]["eligible"] == 30 and len(res["mentors"]) == 10, (res["pipeline"], len(res["mentors"])))
    check("excludedBy.maxRate = 6 mentor giá 300.000đ", res["excludedBy"] == {"maxRate": 6}, res["excludedBy"])
    # considered/excluded đếm MỌI mentor trong profile_db (cả dữ liệu của lần chạy khác) nên chỉ so cận dưới.
    stats = res["pipeline"]
    check("Pipeline: xét ≥ 36 mentor, mọi mentor khác bị ràng buộc hệ thống loại, retrieved = 30 ≤ k",
          stats["considered"] >= 36 and stats["considered"] - sum(stats["excluded"].values()) == 36
          and stats["retrieved"] == 30 and stats["retrieved"] <= stats["k"], stats)

    res = search(limit=50)
    f = res["filters"]
    check("Không truyền param => bộ lọc lấy từ sở thích hồ sơ",
          f["maxRate"] == 150000 and f["days"] == [1, 6] and f["timeOfDay"] == "EVENING" and f["language"] == ["vi"]
          and sorted(f["fromProfileDefaults"]) == ["days", "language", "maxRate", "timeOfDay"], f)
    ids = {m["mentorId"] for m in res["mentors"]}
    check("Kết quả theo sở thích: 28 mentor giá ≤ 150k, tối T2, tiếng Việt",
          ids == {m["id"] for m in cheap}, (len(ids), res["excludedBy"]))
    # pricey chỉ trượt giá; mentor EN chỉ trượt ngôn ngữ; mentor sáng T7 chỉ trượt buổi (T7 nằm trong ngày đã chọn).
    check("excludedBy theo sở thích: maxRate 6, timeOfDay 1, language 1, days 0",
          res["excludedBy"] == {"maxRate": 6, "days": 0, "timeOfDay": 1, "language": 1}, res["excludedBy"])

    res = search(limit=50, maxRate=500000)
    check("Ghi đè maxRate cho lượt này: mentor 300k xuất hiện, maxRate không còn 'từ hồ sơ'",
          len(res["mentors"]) == 34 and "maxRate" not in res["filters"]["fromProfileDefaults"], (len(res["mentors"]), res["filters"]))
    p = call("GET", f"{PROFILE}/api/profile/mentee/{mentee_id}", token=me)
    check("Ghi đè không làm đổi hồ sơ", float(p["budgetMaxPerHour"]) == 150000, p["budgetMaxPerHour"])

    res = search(limit=50, useProfileDefaults=False)
    check("useProfileDefaults=false => không bộ lọc người dùng, đủ 36 mentor",
          len(res["mentors"]) == 36 and res["excludedBy"] == {} and res["filters"]["fromProfileDefaults"] == [], len(res["mentors"]))

    res = search(limit=50, useProfileDefaults=False, days=6, timeOfDay="MORNING")
    check("Ngày T7 + buổi sáng => chỉ mentor có lịch sáng T7", [m["mentorId"] for m in res["mentors"]] == [sat_morning["id"]],
          [m["mentorId"] for m in res["mentors"]])
    res = search(limit=50, useProfileDefaults=False, timeOfDay="AFTERNOON")
    check("Buổi chiều (12–18) không ai có lịch => rỗng, excludedBy.timeOfDay = 36",
          res["mentors"] == [] and res["excludedBy"] == {"timeOfDay": 36}, res["excludedBy"])
    res = search(limit=50, useProfileDefaults=False, language="en", sessionType="MOCK_INTERVIEW", freeOnly=True)
    check("Ngôn ngữ en + loại phiên + miễn phí => đúng mentor tiếng Anh",
          [m["mentorId"] for m in res["mentors"]] == [english["id"]], res["excludedBy"])
    res = search(limit=50, useProfileDefaults=False, minRating=4)
    check("minRating=4: mentor chưa có đánh giá bị loại", res["mentors"] == [] and res["excludedBy"] == {"minRating": 36},
          res["excludedBy"])
    ok, d = expect_error(lambda: search(days=9), 400)
    check("Tham số lọc sai (days=9) => 400", ok, d)

    # ---------------- US-18 ----------------
    print("\nUS-18 — excludedBy để nới điều kiện")
    res = search(limit=10, useProfileDefaults=False, maxRate=0, language="vi")
    # Chỉ mentor tiếng Anh miễn phí qua giá nhưng trượt ngôn ngữ; 35 mentor tiếng Việt chỉ trượt giá.
    check("Kết quả ít: excludedBy chỉ ra bộ lọc giá loại nhiều nhất (35), ngôn ngữ 1",
          res["mentors"] == [] and res["excludedBy"] == {"maxRate": 35, "language": 1}, res["excludedBy"])
    res = search(limit=10, useProfileDefaults=False, language="vi")
    check("Nới bộ lọc giá (bỏ maxRate) => đủ 10 kết quả", len(res["mentors"]) == 10, len(res["mentors"]))

    # ---------------- Interface US-15 ----------------
    print("\nInterface cho mentoring-service — similar-mentors")
    url = f"{MATCHING}/internal/matching/similar-mentors?menteeId={mentee_id}&excludeMentorId={cheap[0]['id']}&limit=3"
    ok, d = expect_error(lambda: call("GET", url, token=me), 403)
    check("Yêu cầu X-Internal-Token (JWT bị 403)", ok, d)
    sim = call("GET", url, internal=True)["mentors"]
    check("Trả đúng 3 mentor {mentorId, fullName, score}, không có mentor bị loại trừ",
          len(sim) == 3 and all(set(m) == {"mentorId", "fullName", "score"} for m in sim)
          and cheap[0]["id"] not in {m["mentorId"] for m in sim}, sim)
    check("Áp sở thích hồ sơ: giá ≤ 150.000đ", all(rate_of[m["mentorId"]] <= 150000 for m in sim), sim)
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee_id}/preferences",
         {"preferredDays": [], "preferredTimeOfDay": None, "budgetMaxPerHour": 0, "languages": ["en"]}, token=me)
    sim = call("GET", f"{MATCHING}/internal/matching/similar-mentors?menteeId={mentee_id}"
                      f"&excludeMentorId={cheap[0]['id']}&limit=3", internal=True)["mentors"]
    check("Sở thích quá chặt (miễn phí + tiếng Anh) => mentor khớp đứng đầu, phần còn lại được nới để đủ 3",
          len(sim) == 3 and sim[0]["mentorId"] == english["id"], sim)
    unknown = call("GET", f"{MATCHING}/internal/matching/similar-mentors?menteeId={uuid.uuid4()}"
                          f"&excludeMentorId={cheap[0]['id']}", internal=True)
    check("Mentee chưa có hồ sơ => danh sách rỗng", unknown == {"mentors": []}, unknown)

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
