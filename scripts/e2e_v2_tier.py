#!/usr/bin/env python3
"""
E2E bản chốt v2.0 — cấp độ mentor và khung giá (docs/ban-chot-nghiep-vu.md §3–4).

    python3 scripts/e2e_v2_tier.py

Mentor làm phỏng vấn → admin duyệt kèm cấp → khung giá, chọn giá trong khung, đổi cấp kẹp giá, bộ lọc "miễn phí" đã gỡ.
"""
import sys
import time
import uuid

from common import AI, AUTH, MATCHING, PROFILE, ApiError, call

RUN = uuid.uuid4().hex[:6]
results = []
STRONG = ("Toi dung Redis theo cache-aside voi TTL va invalidation khi ghi. Trong du an thuc te latency giam tu 300ms "
          "xuong 40ms. Toi can nhac trade-off giua consistency va hieu nang, dung index, transaction, REST API "
          "versioning, status code 201/404, pagination va idempotent. Toi huong dan junior bang bai tap nho.")


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def status_code(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error", {}).get("code") if isinstance(e.body, dict) else e.body)
    return 200, None


def main():
    t0 = time.time()
    print(f"E2E v2.0 tier run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    at = admin["accessToken"]

    tiers = call("GET", f"{PROFILE}/api/profile/pricing-tiers", token=at)
    bands = {t["tier"]: (t["min"], t["max"]) for t in tiers["tiers"]}
    check("Khung giá theo bản chốt (100–200k / 200–400k / 400–700k, bước 10.000)",
          bands == {"JUNIOR": (100000, 200000), "SENIOR": (200000, 400000), "EXPERT": (400000, 700000)} and tiers["step"] == 10000, tiers)

    m = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.tier.{RUN}@test.local", "password": "Passw0rd!",
                                                    "role": "MENTOR", "fullName": f"V2 Tier {RUN}"})
    mt, uid = m["accessToken"], m["userId"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{uid}", {
        "displayName": f"V2 Mentor {RUN}", "domain": "backend", "skills": ["Java", "Redis"],
        "bio": "Backend engineer 8 nam, huong dan junior xay dung REST API.", "yearsExperience": 8,
        "hourlyRate": 0, "capacity": 3, "portfolioLinks": []}, token=mt)
    call("PUT", f"{PROFILE}/api/profile/mentor/{uid}/availability",
         {"slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=mt)

    status, code = status_code(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{uid}/rate", {"hourlyRate": 150000}, token=mt))
    check("Chưa có cấp → 409 TIER_NOT_ASSIGNED", status == 409 and code == "TIER_NOT_ASSIGNED", (status, code))

    iv = call("POST", f"{AI}/api/ai/interviews", {"selfAnswerAcknowledged": True}, token=mt)
    while iv["status"] == "IN_PROGRESS":
        iv = call("POST", f"{AI}/api/ai/interviews/{iv['id']}/answers", {"answer": STRONG}, token=mt)
    detail = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=at)
    score = detail["overallScore"]
    expected = None if score < 60 else "JUNIOR" if score < 75 else "SENIOR" if score < 88 else "EXPERT"
    check("Admin thấy cấp đề xuất đúng ngưỡng 60/75/88 từ điểm AI", detail["suggestedTier"] == expected, (score, detail["suggestedTier"]))
    check("Mentor không thấy cấp đề xuất", call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=mt)["suggestedTier"] is None)

    call("POST", f"{AI}/api/ai/admin/interviews/{iv['id']}/review",
         {"decision": "APPROVE", "note": "Chon Senior theo kinh nghiem 8 nam", "tier": "SENIOR"}, token=at)
    p = call("GET", f"{PROFILE}/api/profile/mentor/{uid}", token=mt)
    check("Duyệt → mentor có tier SENIOR, giá được kẹp về sàn khung (0 → 200.000)",
          p["tier"] == "SENIOR" and float(p["hourlyRate"]) == 200000, (p["tier"], p["hourlyRate"]))

    call("PUT", f"{PROFILE}/api/profile/mentor/{uid}/rate", {"hourlyRate": 320000}, token=mt)
    check("Chọn giá 320.000 trong khung SENIOR", float(call("GET", f"{PROFILE}/api/profile/mentor/{uid}", token=mt)["hourlyRate"]) == 320000)
    for bad in (150000, 450000, 325000):
        status, code = status_code(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{uid}/rate", {"hourlyRate": bad}, token=mt))
        check(f"Giá {bad} ngoài khung / lệch bước → 400 RATE_OUT_OF_TIER", status == 400 and code == "RATE_OUT_OF_TIER", (status, code))

    call("PUT", f"{PROFILE}/internal/mentor/{uid}/tier", {"tier": "JUNIOR"}, internal=True)
    p = call("GET", f"{PROFILE}/api/profile/mentor/{uid}", token=mt)
    check("Hạ cấp JUNIOR → giá kẹp về trần khung (200.000)", p["tier"] == "JUNIOR" and float(p["hourlyRate"]) == 200000, (p["tier"], p["hourlyRate"]))

    status, _ = status_code(lambda: call("GET", f"{MATCHING}/api/matching/mentors?menteeId={uid}&freeOnly=true", token=mt))
    check("Tham số freeOnly không còn được nhận (bị bỏ qua, không lỗi 500)", status != 500, status)

    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
