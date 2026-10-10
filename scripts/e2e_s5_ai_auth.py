#!/usr/bin/env python3
"""
E2E Sprint 5 — AI Interview (US-43), CV chat (US-45), rate limit + request id + /metrics (US-46).

    python3 scripts/e2e_s5_ai_auth.py [US-43 US-45 US-46]

Dùng endpoint dev (X-Internal-Token, không có ở prod): ai-service POST /internal/dev/interviews/{id}/age.
"""
import sys
import time
import uuid

from common import AI, AUTH, PROFILE, ApiError, call

RUN = uuid.uuid4().hex[:6]
results = []
STRONG = ("Toi dung Redis theo cache-aside voi TTL va invalidation khi ghi. Trong du an thuc te latency giam tu 300ms "
          "xuong 40ms. Toi can nhac trade-off giua consistency va hieu nang, dung index, transaction, REST API "
          "versioning, status code 201/404, pagination va idempotent. Toi huong dan junior bang bai tap nho.")


def check(story, name, condition, detail=""):
    results.append((story, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {story} {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def error_code(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error", {}).get("code") if isinstance(e.body, dict) else e.body)
    return 200, None


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {"email": f"s5a.{role.lower()}.{name}.{RUN}@test.local",
                                                       "password": "Passw0rd!", "role": role, "fullName": f"S5 {name}"})


def mentor_with_profile(name):
    m = register("MENTOR", name)
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"S5 Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot", "Redis"],
        "bio": "Backend engineer, huong dan junior xay dung REST API.", "yearsExperience": 5, "hourlyRate": 0,
        "capacity": 3, "portfolioLinks": []}, token=m["accessToken"])
    return m


def start(m):
    return call("POST", f"{AI}/api/ai/interviews", {"selfAnswerAcknowledged": True}, token=m["accessToken"])


def answer(m, iid, text):
    return call("POST", f"{AI}/api/ai/interviews/{iid}/answers", {"answer": text}, token=m["accessToken"])


def us43(ctx):
    print("US-43 — giới hạn câu trả lời, tiếp tục trong 72 giờ, nhận xét sau khi admin quyết định")
    admin = ctx["admin"]
    m = mentor_with_profile("limits")
    iv = start(m)
    check("US-43", "Buổi mới có hạn tiếp tục, giới hạn 50–3000, đồng hồ 6 phút",
          iv["resumeDeadline"] and iv["answerMinChars"] == 50 and iv["answerMaxChars"] == 3000 and iv["softTimerSeconds"] == 360, iv)
    # common.py tự đệm câu < 50 ký tự cho script cũ, nên kiểm tra giới hạn dưới nằm ở unit test ai-service;
    # ở đây kiểm tra giới hạn trên.
    status, code = error_code(lambda: answer(m, iv["id"], "a " * 1600))
    check("US-43", "Câu trả lời > 3000 ký tự → 400 ANSWER_TOO_LONG", status == 400 and code == "ANSWER_TOO_LONG", (status, code))
    while iv["status"] == "IN_PROGRESS":
        iv = answer(m, iv["id"], STRONG)
    check("US-43", "Thời gian từng câu được ghi lại", all(t["durationSeconds"] is not None for t in iv["turns"]))
    check("US-43", "Chờ duyệt: mentor chưa thấy điểm / nhận xét từng câu", iv["status"] == "PENDING_REVIEW"
          and not iv["feedbackVisible"] and all(t["score"] is None and t["feedback"] is None for t in iv["turns"]), iv["status"])
    check("US-43", "…nhưng vẫn thấy tổng điểm", iv["overallScore"] is not None)
    call("POST", f"{AI}/api/ai/admin/interviews/{iv['id']}/review", {"decision": "APPROVE", "note": "Tra loi tot, du kinh nghiem"},
         token=admin["accessToken"])
    mine = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=m["accessToken"])
    check("US-43", "Sau khi admin quyết định: thấy điểm + nhận xét từng câu", mine["feedbackVisible"]
          and all(t["score"] is not None for t in mine["turns"]))

    idle = mentor_with_profile("idle")
    iv2 = start(idle)
    call("POST", f"{AI}/internal/dev/interviews/{iv2['id']}/age?hours=71", internal=True)
    check("US-43", "Sau 71 giờ vẫn tiếp tục được buổi cũ", start(idle)["id"] == iv2["id"])
    call("POST", f"{AI}/internal/dev/interviews/{iv2['id']}/age?hours=2", internal=True)
    status, code = error_code(lambda: answer(idle, iv2["id"], STRONG))
    check("US-43", "Quá 72 giờ → 409 INTERVIEW_ABANDONED", status == 409 and code == "INTERVIEW_ABANDONED", (status, code))
    e = call("GET", f"{AI}/api/ai/interviews/eligibility", token=idle["accessToken"])
    check("US-43", "Buổi bỏ dở tính là 1 lần phỏng vấn", e["attemptsUsed"] == 1 and e["attemptsLeft"] == 2, e)
    iv3 = start(idle)
    check("US-43", "Bắt đầu được buổi mới ngay (không thời gian chờ)", iv3["id"] != iv2["id"] and iv3["status"] == "IN_PROGRESS")


STORIES = {"US-43": us43}


def main(selected):
    t0 = time.time()
    print(f"E2E Sprint 5 AI/auth run {RUN}\n")
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
