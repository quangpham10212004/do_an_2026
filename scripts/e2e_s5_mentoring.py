#!/usr/bin/env python3
"""
E2E Sprint 5 — Team C (mentoring-service, payment-service): US-41 đánh giá có cấu trúc, US-42 rút tiền + biên lai.

    python3 scripts/e2e_s5_mentoring.py [US-41 US-42]

Dùng lại helper của e2e Sprint 3 và endpoint dev (X-Internal-Token).
"""
import sys
import time

from common import AUTH, MENTORING, PROFILE, ApiError, call
from e2e_s3_mentoring import (RUN, accepted_mentee, approved_mentor, at, completed, dev, error_code, paid)

results = []


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def review(user, sid, rating, comment=None, method="POST", tags=None, sub=4):
    return call(method, f"{MENTORING}/api/mentoring/sessions/{sid}/review", {
        "rating": rating, "knowledge": sub, "clarity": sub, "preparation": sub, "comment": comment,
        "tags": tags or []}, token=user["accessToken"])


def done_session(mentee, mentor, days):
    s = paid(mentee, mentor, at(days, 9))
    completed(mentee, mentor, s["id"])
    return s


def us41(ctx):
    print("US-41 — đánh giá có cấu trúc")
    admin = ctx["admin"]
    mentor = approved_mentor(admin["accessToken"], "review")
    mentee = accepted_mentee(mentor, "review")
    s1, s2, s3, s4 = (done_session(mentee, mentor, d) for d in (3, 4, 5, 6))

    r1 = review(mentee, s1["id"], 5, "Rat huu ich", tags=["PRACTICAL_EXAMPLES", "GOOD_LISTENER"])
    check("US-41", "Đánh giá có 3 điểm thành phần + thẻ", r1["knowledge"] == 4 and r1["tags"] == ["PRACTICAL_EXAMPLES", "GOOD_LISTENER"], r1)
    status, code = error_code(lambda: review(mentee, s2["id"], 2, "Te"))
    check("US-41", "≤ 2 sao mà nhận xét < 20 ký tự → 400 COMMENT_REQUIRED", status == 400 and code == "COMMENT_REQUIRED", (status, code))
    review(mentee, s2["id"], 4)
    summary = call("GET", f"{MENTORING}/api/mentoring/mentors/{mentor['userId']}/review-summary", token=mentee["accessToken"])
    check("US-41", "2 đánh giá → 'Mentor mới', chưa có điểm sao", summary["newMentor"] and summary["rating"] is None, summary)
    profile = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentee["accessToken"])
    check("US-41", "Hồ sơ mentor nhận số đánh giá thật (2)", profile["ratingCount"] == 2, profile["ratingCount"])

    edited = review(mentee, s2["id"], 5, method="PUT")
    check("US-41", "Sửa trong 48 giờ", edited["rating"] == 5 and edited["updatedAt"], edited)
    dev(f"sessions/{s3['id']}/shift", {"resolvedDaysAgo": 15})
    status, code = error_code(lambda: review(mentee, s3["id"], 5))
    check("US-41", "Đánh giá ngày thứ 15 → 409 REVIEW_WINDOW_CLOSED", status == 409 and code == "REVIEW_WINDOW_CLOSED", (status, code))
    review(mentee, s4["id"], 3)
    summary = call("GET", f"{MENTORING}/api/mentoring/mentors/{mentor['userId']}/review-summary", token=mentee["accessToken"])
    check("US-41", "3 đánh giá → có điểm Bayes (khác trung bình thô 4.33)", not summary["newMentor"] and summary["rating"]
          and summary["rating"] != round(13 / 3, 2), summary.get("rating"))

    reply = call("POST", f"{MENTORING}/api/mentoring/reviews/{r1['id']}/reply", {"reply": "Cam on em!"}, token=mentor["accessToken"])
    check("US-41", "Mentor phản hồi công khai", reply["mentorReply"] == "Cam on em!")
    status, code = error_code(lambda: call("POST", f"{MENTORING}/api/mentoring/reviews/{r1['id']}/reply", {"reply": "lan 2"},
                                           token=mentor["accessToken"]))
    check("US-41", "Phản hồi lần 2 → 409 ALREADY_REPLIED", status == 409 and code == "ALREADY_REPLIED", (status, code))

    fb = call("POST", f"{MENTORING}/api/mentoring/sessions/{s1['id']}/mentee-feedback",
              {"preparation": 5, "engagement": 5, "comment": "Chuan bi ky"}, token=mentor["accessToken"])
    check("US-41", "Nhận xét riêng về mentee (1 nhận xét → chưa có huy hiệu)", fb["feedbackCount"] == 1 and fb["badge"] is None, fb)
    status, _ = error_code(lambda: call("GET", f"{MENTORING}/api/mentoring/mentees/{mentee['userId']}/reliability",
                                        token=mentee["accessToken"]))
    check("US-41", "Mentee không xem được nhận xét về mình → 403", status == 403, status)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s2['id']}/mentee-feedback", {"preparation": 4, "engagement": 5}, token=mentor["accessToken"])
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s4['id']}/mentee-feedback", {"preparation": 5, "engagement": 4}, token=mentor["accessToken"])
    rel = call("GET", f"{MENTORING}/api/mentoring/mentees/{mentee['userId']}/reliability", token=mentor["accessToken"])
    check("US-41", "3 nhận xét tốt → huy hiệu RELIABLE", rel["badge"] == "RELIABLE", rel)


STORIES = {"US-41": us41}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 5 Team C (mentoring/payment) run {RUN}\n")
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
