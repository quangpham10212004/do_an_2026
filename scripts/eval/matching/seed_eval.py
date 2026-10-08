#!/usr/bin/env python3
"""
US-26 — seed bộ dữ liệu đánh giá (dataset.py: 37 mentor, 30 mentee) vào hệ thống đang chạy để chụp gợi ý từ API
thật (`capture.py --source api`). Seed riêng thay vì mở rộng seed_demo.py để không làm rối dữ liệu demo.

Mentor được duyệt nhanh bằng endpoint nội bộ (như seed_demo.py) và nhận rating/số lượt đánh giá của bộ dữ liệu qua
PUT /internal/mentor/{id}/rating. Chạy lặp lại được (đăng ký trùng thì đăng nhập, hồ sơ được ghi đè).
Ghi out/ids.json: key -> {userId, accessToken}.

    python3 scripts/eval/matching/seed_eval.py
"""
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))

import dataset  # noqa: E402
from common import MATCHING, PROFILE, ApiError, call, register_or_login  # noqa: E402

PASSWORD = "Eval@1234"


def wait_indexed(user_id, token, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if call("GET", f"{MATCHING}/api/matching/index-status?userId={user_id}", token=token)["status"] == "UPDATED":
                return True
        except ApiError:
            pass
        time.sleep(0.5)
    return False


def main() -> int:
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    ids = {"mentors": {}, "mentees": {}}
    for m in dataset.mentor_dicts():
        auth = register_or_login(f"eval.mentor.{m['key']}@eval.local", PASSWORD, "MENTOR", m["display_name"])
        uid, token = auth["userId"], auth["accessToken"]
        call("PUT", f"{PROFILE}/api/profile/mentor/{uid}", {
            "displayName": m["display_name"], "skills": m["skills"], "domain": m["domain"], "bio": m["bio"],
            "yearsExperience": m["years_experience"], "hourlyRate": m["hourly_rate"], "capacity": 5,
            "portfolioLinks": []}, token=token)
        call("PUT", f"{PROFILE}/api/profile/mentor/{uid}/availability", {"slots": [
            {"dayOfWeek": d, "startTime": s, "endTime": e} for d, s, e in m["slots"]]}, token=token)
        call("PUT", f"{PROFILE}/internal/mentor/{uid}/verification", {"status": "APPROVED"}, internal=True)
        call("PUT", f"{PROFILE}/internal/mentor/{uid}/rating",
             {"rating": m["rating"], "ratingCount": m["rating_count"]}, internal=True)
        ids["mentors"][m["key"]] = {"userId": uid, "accessToken": token}
    for e in dataset.mentee_dicts():
        auth = register_or_login(f"eval.mentee.{e['key']}@eval.local", PASSWORD, "MENTEE", e["display_name"])
        uid, token = auth["userId"], auth["accessToken"]
        call("PUT", f"{PROFILE}/api/profile/mentee/{uid}", {
            "displayName": e["display_name"], "goal": e["goal"], "domain": e["domain"],
            "currentLevel": e["current_level"], "skills": e["skills"], "portfolioLinks": []}, token=token)
        call("PUT", f"{PROFILE}/api/profile/mentee/{uid}/preferences", {
            "preferredDays": e["preferred_days"], "preferredTimeOfDay": e["preferred_time_of_day"],
            "budgetMaxPerHour": None, "languages": []}, token=token)
        ids["mentees"][e["key"]] = {"userId": uid, "accessToken": token}
    pending = [v for group in ids.values() for v in group.values() if not wait_indexed(v["userId"], v["accessToken"])]
    (out / "ids.json").write_text(json.dumps(ids, indent=1), encoding="utf-8")
    print(f"Seed {len(ids['mentors'])} mentor + {len(ids['mentees'])} mentee; chưa lập chỉ mục: {len(pending)} → {out / 'ids.json'}")
    return 1 if pending else 0


if __name__ == "__main__":
    sys.exit(main())
