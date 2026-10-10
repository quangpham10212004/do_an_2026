#!/usr/bin/env python3
"""
E2E Sprint 5 — AI Interview (US-43), CV chat (US-45), rate limit + request id + /metrics (US-46).

    python3 scripts/e2e_s5_ai_auth.py [US-43 US-45 US-46]

Dùng endpoint dev (X-Internal-Token, không có ở prod): ai-service POST /internal/dev/interviews/{id}/age.
"""
import sys
import time
import uuid

import json
import random
import subprocess
import urllib.error
import urllib.request

from common import (AI, AUTH, LEARNING, MATCHING, MENTORING, PAYMENT, PROFILE, SAMPLE_CV_LINES, ApiError, call, make_pdf,
                    multipart_file)

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


CHAT_ANSWER = "Toi muon tro thanh backend developer Java trong 6 thang, tap trung system design."


def cv_conversation(mentee, skills):
    body, ctype = multipart_file("file", "cv.pdf", make_pdf(SAMPLE_CV_LINES), fields={"consentExternalAi": "false"})
    cv = call("POST", f"{AI}/api/ai/mentee/{mentee['userId']}/cv-upload", token=mentee["accessToken"],
              raw_body=body, content_type=ctype)["cv"]
    call("PUT", f"{AI}/api/ai/cv/{cv['id']}/confirmed-fields", {"skills": skills}, token=mentee["accessToken"])
    return call("POST", f"{AI}/api/ai/cv/{cv['id']}/enrichment-conversation", token=mentee["accessToken"])["conversation"]


def mentee_skills(mentee):
    return call("GET", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", token=mentee["accessToken"])["skills"]


def us45(ctx):
    print("US-45 — chatbot CV: bỏ qua câu hỏi, chọn kỹ năng gợi ý, xoá kèm kỹ năng, lưu giữ 12 tháng")
    mentee = register("MENTEE", "cv")
    token = mentee["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", {
        "displayName": f"S5 CV {RUN}", "domain": "backend", "currentLevel": "BEGINNER", "skills": ["React"],
        "goal": "Hoc backend Java", "portfolioLinks": []}, token=token)

    conv = cv_conversation(mentee, ["Java", "Docker", "PostgreSQL"])
    check("US-45", "Hội thoại trả kỹ năng gợi ý từ CV (chip)", conv["suggestedSkills"] == ["Java", "Docker", "PostgreSQL"],
          str(conv.get("suggestedSkills")))
    url = f"{AI}/api/ai/enrichment/conversations/{conv['id']}/answers"
    check("US-45", "Câu trả lời rỗng (không bấm Bỏ qua) → 400 ANSWER_REQUIRED",
          error_code(lambda: call("POST", url, {"answer": "  "}, token=token)) == (400, "ANSWER_REQUIRED"))
    conv = call("POST", url, {"skipped": True}, token=token)
    check("US-45", "“Bỏ qua” lưu skipped và chuyển sang câu tiếp theo",
          conv["messages"][0]["skipped"] is True and conv["currentTurn"] == 2)
    while conv["status"] == "IN_PROGRESS":
        conv = call("POST", url, {"answer": CHAT_ANSWER}, token=token)
    check("US-45", "Bỏ qua 1 câu vẫn tạo được mục tiêu nháp", conv["goalStatus"] == "DRAFT" and bool(conv["enrichedGoal"]))

    confirm = f"{AI}/api/ai/enrichment/conversations/{conv['id']}/confirm-goal"
    check("US-45", "Kỹ năng ngoài danh sách gợi ý → 400 INVALID_SKILLS",
          error_code(lambda: call("POST", confirm, {"goal": conv["enrichedGoal"], "skills": ["Kubernetes"]},
                                  token=token)) == (400, "INVALID_SKILLS"))
    done = call("POST", confirm, {"goal": conv["enrichedGoal"], "skills": ["java", "Docker"]}, token=token)
    check("US-45", "Chỉ kỹ năng được chọn được thêm (giữ cách viết trong CV)", done["addedSkills"] == ["Java", "Docker"],
          str(done["addedSkills"]))
    skills = []
    for _ in range(20):  # đồng bộ hồ sơ chạy ngay sau confirm (có job thử lại)
        skills = mentee_skills(mentee)
        if "Docker" in skills:
            break
        time.sleep(0.5)
    check("US-45", "Hồ sơ có kỹ năng đã chọn, không có kỹ năng bỏ chọn",
          "Java" in skills and "Docker" in skills and "PostgreSQL" not in skills and "React" in skills, str(skills))

    [row] = [c for c in call("GET", f"{AI}/api/ai/cv/mine", token=token) if c["id"] == conv["cvId"]]
    check("US-45", "CV của tôi: hiển thị kỹ năng đã thêm và hạn xoá 12 tháng",
          row["addedSkills"] == ["Java", "Docker"] and row["deleteAfter"] and row["purgedAt"] is None)

    # Lưu giữ 12 tháng: CV thứ hai (chưa xác nhận mục tiêu) bị lùi ngày 366 ngày rồi chạy job.
    old = cv_conversation(mentee, ["Git"])
    purged = call("POST", f"{AI}/internal/dev/cvs/{old['cvId']}/age?days=366", internal=True)
    check("US-45", "Job lưu giữ xoá CV quá 12 tháng", purged["purged"] >= 1, str(purged))
    check("US-45", "Tải file CV đã quá hạn → 410 CV_PURGED",
          error_code(lambda: call("GET", f"{AI}/api/ai/cv/{old['cvId']}/file", token=token)) == (410, "CV_PURGED"))
    [aged] = [c for c in call("GET", f"{AI}/api/ai/cv/mine", token=token) if c["id"] == old["cvId"]]
    check("US-45", "CV quá hạn vẫn trong danh sách với purgedAt", aged["purgedAt"] is not None)
    check("US-45", "CV mới không bị job xoá",
          any(c["id"] == conv["cvId"] and c["purgedAt"] is None for c in call("GET", f"{AI}/api/ai/cv/mine", token=token)))

    call("DELETE", f"{AI}/api/ai/cv/{conv['cvId']}?removeSkills=true", token=token)
    skills = mentee_skills(mentee)
    check("US-45", "Xoá CV kèm “gỡ kỹ năng” bỏ Java, Docker khỏi hồ sơ, giữ kỹ năng khác",
          "Java" not in skills and "Docker" not in skills and "React" in skills, str(skills))


def raw(method, url, body=None, headers=None):
    """Như call() nhưng trả (status, headers, body) — để đọc Retry-After / X-Request-Id."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.headers, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode()


def code_of(text):
    try:
        return json.loads(text)["error"]["code"]
    except (ValueError, KeyError, TypeError):
        return None


def upload_cv(user):
    body, ctype = multipart_file("file", "cv.pdf", make_pdf(SAMPLE_CV_LINES), fields={"consentExternalAi": "false"})
    req = urllib.request.Request(f"{AI}/api/ai/mentee/{user['userId']}/cv-upload", data=body, method="POST",
                                 headers={"Content-Type": ctype, "Authorization": f"Bearer {user['accessToken']}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.headers, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode()


def service_logs(services, since="3m"):
    try:
        out = subprocess.run(["docker", "compose", "logs", "--no-log-prefix", "--since", since, *services],
                             capture_output=True, text=True, timeout=60)
        return out.stdout.splitlines()
    except (OSError, subprocess.SubprocessError):
        return []


def us46(ctx):
    print("US-46 — giới hạn tần suất (NFR-10), X-Request-Id + log JSON + /metrics (NFR-17)")
    from e2e_s3_mentoring import approved_mentor, send_request

    # ---- Đăng nhập: 5 / phút / IP
    register("MENTEE", "rl")
    ip = f"198.51.100.{random.randint(1, 254)}"
    login = {"email": f"s5a.mentee.rl.{RUN}@test.local", "password": "Passw0rd!"}
    statuses = [raw("POST", f"{AUTH}/api/auth/login", login if i % 2 == 0 else {**login, "password": "Wrong123!"},
                    {"X-Forwarded-For": ip})[0] for i in range(5)]
    status, headers, text = raw("POST", f"{AUTH}/api/auth/login", login, {"X-Forwarded-For": ip})
    check("US-46", "5 lần đăng nhập đầu (đúng/sai) không bị chặn", 429 not in statuses, str(statuses))
    check("US-46", "Lần đăng nhập thứ 6 / phút / IP → 429 RATE_LIMITED + Retry-After",
          status == 429 and code_of(text) == "RATE_LIMITED" and headers.get("Retry-After") == "60", (status, text[:120]))
    other = raw("POST", f"{AUTH}/api/auth/login", login, {"X-Forwarded-For": f"203.0.113.{random.randint(1, 254)}"})
    check("US-46", "IP khác vẫn đăng nhập được", other[0] == 200, other[0])

    # ---- Tin nhắn: 30 / phút / người gửi
    admin = ctx["admin"]
    mentor = approved_mentor(admin["accessToken"], f"rl{RUN}")
    mentee = register("MENTEE", "rlmsg")
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", {
        "displayName": f"S5 RL {RUN}", "domain": "backend", "currentLevel": "BEGINNER", "skills": ["Java"],
        "goal": "Hoc backend Java trong 6 thang toi", "portfolioLinks": []}, token=mentee["accessToken"])
    conv = send_request(mentee, mentor)["id"]
    auth_mentor = {"Authorization": f"Bearer {mentor['accessToken']}"}
    sent = [raw("POST", f"{MENTORING}/api/mentoring/conversations/{conv}/messages", {"body": f"Tin {i}"}, auth_mentor)[0]
            for i in range(30)]
    status, headers, text = raw("POST", f"{MENTORING}/api/mentoring/conversations/{conv}/messages", {"body": "Tin 31"},
                                auth_mentor)
    check("US-46", "30 tin / phút được gửi", sent.count(201) == 30, str(set(sent)))
    check("US-46", "Tin thứ 31 trong 1 phút → 429 RATE_LIMITED + Retry-After",
          status == 429 and code_of(text) == "RATE_LIMITED" and 0 < int(headers.get("Retry-After", "0")) <= 60,
          (status, text[:120]))

    # ---- AI Matching: 20 / phút / người dùng
    auth_mentee = {"Authorization": f"Bearer {mentee['accessToken']}"}
    url = f"{MATCHING}/api/matching/mentors?menteeId={mentee['userId']}&limit=3"
    first = [raw("GET", url, headers=auth_mentee)[0] for _ in range(20)]
    status, headers, text = raw("GET", url, headers=auth_mentee)
    check("US-46", "20 lần tìm mentor / phút không bị chặn", 429 not in first, str(set(first)))
    check("US-46", "Lần tìm mentor thứ 21 → 429 RATE_LIMITED + Retry-After",
          status == 429 and code_of(text) == "RATE_LIMITED" and headers.get("Retry-After"), (status, text[:120]))

    # ---- CV: 5 / giờ / người dùng
    uploads = [upload_cv(mentee)[0] for _ in range(5)]
    status, headers, text = upload_cv(mentee)
    check("US-46", "5 CV / giờ được tải lên", uploads == [200] * 5, str(uploads))
    check("US-46", "CV thứ 6 trong 1 giờ → 429 RATE_LIMITED + Retry-After",
          status == 429 and code_of(text) == "RATE_LIMITED" and headers.get("Retry-After"), (status, text[:120]))

    # ---- X-Request-Id qua 3 service: ai-service (confirm-goal) → profile-service (enrichment) → matching-service (reindex)
    tracer = register("MENTEE", "trace")
    call("PUT", f"{PROFILE}/api/profile/mentee/{tracer['userId']}", {
        "displayName": f"S5 Trace {RUN}", "domain": "backend", "currentLevel": "BEGINNER", "skills": ["React"],
        "goal": "Hoc backend Java", "portfolioLinks": []}, token=tracer["accessToken"])
    conversation = cv_conversation(tracer, ["Java", "Docker"])
    answers = f"{AI}/api/ai/enrichment/conversations/{conversation['id']}/answers"
    while conversation["status"] == "IN_PROGRESS":
        conversation = call("POST", answers, {"answer": CHAT_ANSWER}, token=tracer["accessToken"])
    trace_id = f"e2e-trace-{RUN}-{random.randint(1000, 9999)}"
    status, headers, _ = raw("POST", f"{AI}/api/ai/enrichment/conversations/{conversation['id']}/confirm-goal",
                             {"goal": conversation["enrichedGoal"]},
                             {"Authorization": f"Bearer {tracer['accessToken']}", "X-Request-Id": trace_id})
    check("US-46", "Response trả lại X-Request-Id đã gửi", status == 200 and headers.get("X-Request-Id") == trace_id,
          (status, headers.get("X-Request-Id")))
    found = {}
    for _ in range(20):
        found = {}
        for line in service_logs(["ai-service", "profile-service", "matching-service"]):
            if trace_id not in line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if entry.get("requestId") == trace_id:
                found.setdefault(entry.get("service"), entry)
        if len(found) >= 3:
            break
        time.sleep(1)
    check("US-46", "Cùng một requestId xuất hiện trong log JSON của ai-, profile- và matching-service",
          {"ai-service", "profile-service", "matching-service"} <= set(found), sorted(found))

    # ---- /metrics (Prometheus) ở mọi service
    for name, base in [("auth", AUTH), ("profile", PROFILE), ("mentoring", MENTORING), ("payment", PAYMENT),
                       ("learning", LEARNING), ("matching", MATCHING), ("ai", AI)]:
        status, headers, text = raw("GET", f"{base}/metrics")
        check("US-46", f"GET /metrics của {name}-service trả số liệu Prometheus",
              status == 200 and "# TYPE" in text and ("http_server_requests_seconds" in text or "http_requests_total" in text),
              status)


STORIES = {"US-43": us43, "US-45": us45, "US-46": us46}


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
