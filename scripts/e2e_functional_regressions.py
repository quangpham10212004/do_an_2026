"""Regression checks for PROF-04 and VER-02/04/05 on an isolated Compose stack."""
import sys

from common import AI, AUTH, MATCHING, MENTORING, PROFILE, ApiError, call, multipart_file
from e2e_acceptance import wait_indexed
from e2e_s2_cv import upload
from e2e_s4_profile_matching import GOAL
from e2e_v2_booking import accepted_mentee, at, book, register, session, topup, wallet


def get(base, path, user):
    return call("GET", base + path, token=user["accessToken"])


def post(base, path, user, body=None):
    return call("POST", base + path, body, token=user["accessToken"])


def skill_guidance():
    mentee = register("MENTEE", "skill-guidance")
    mid = mentee["userId"]
    call("PUT", f"{PROFILE}/api/profile/mentee/{mid}", {
        "displayName": "Skill guidance test", "domain": "backend", "goal": GOAL, "skills": ["Java"],
    }, token=mentee["accessToken"])
    cv = upload(mentee, "false")["cv"]
    path = f"/api/ai/cv/{cv['id']}"
    parsed = cv["parsed"]
    call("PUT", AI + path + "/confirmed-fields", {
        **{field: parsed[field] for field in ("skills", "yearsExperience", "projects", "education")},
        "role": parsed["currentRole"],
    }, token=mentee["accessToken"])
    conv = post(AI, path + "/enrichment-conversation", mentee)["conversation"]
    answers = f"/api/ai/enrichment/conversations/{conv['id']}/answers"
    reply = post(AI, answers, mentee, {"answer": "Tôi nên mô tả kỹ năng Java và Spring Boot như thế nào trong hồ sơ?"})
    assert reply.get("assistantReply") and "Java" in reply["assistantReply"], reply
    assert reply["currentQuestion"] == conv["currentQuestion"] and reply["messages"] == conv["messages"]
    next_turn = post(AI, answers, mentee, {"answer": "Tôi muốn làm lập trình viên Backend Java."})
    assert next_turn["currentTurn"] == conv["currentTurn"] + 1 and not next_turn.get("assistantReply")


def scored_interview():
    mentor = register("MENTOR", "verification-regression")
    mid = mentor["userId"]
    path = f"/api/profile/mentor/{mid}"
    call("PUT", PROFILE + path, {
        "displayName": "Mentor verification test", "domain": "backend", "skills": ["Java", "Spring Boot", "Docker"],
        "bio": "Backend engineer with experience in Java and mentoring.", "yearsExperience": 7,
        "hourlyRate": 300000, "capacity": 20, "isAvailable": True,
    }, token=mentor["accessToken"])
    call("PUT", PROFILE + path + "/availability", {
        "slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)],
    }, token=mentor["accessToken"])
    base = "/api/ai/verification"
    track = next(t for t in get(AI, base + "/status", mentor)["tracks"] if t["domain"] == "backend")
    interview = post(AI, base + "/interviews", mentor, {"trackId": track["id"], "consent": True})
    path = base + "/interviews/" + interview["id"]
    while interview["question"]:
        question = interview["question"]
        transcript = (
            f"Đầu tiên, tôi giải thích cho junior: {question['text']} "
            "Trong dự án thực tế, nhóm tôi từng xử lý sự cố production và đo benchmark giảm từ 300ms xuống 90ms. "
            "Ví dụ REST API dùng resource, HTTP status, pagination, versioning, idempotency và validation. "
            "Transaction dùng ACID, isolation, optimistic locking, deadlock, rollback, index, explain và query plan. "
            "Cache dùng Redis, TTL, invalidation, cache aside, cache stampede và consistency. "
            "Message queue dùng Kafka, retry, backoff, DLQ và at-least-once. "
            "Bảo mật dùng JWT, OAuth2, CORS, CSRF, SQL injection, rate limit. "
            "Kiểm thử dùng unit test, integration test, e2e, mock, Testcontainers. "
            "Tiếp theo, trong công ty chúng tôi phân tích đánh đổi, nhược điểm, chi phí và rủi ro. "
            "Cuối cùng tôi hướng dẫn mentee làm bài tập, review code, nhận feedback và xây checklist theo dõi mục tiêu."
        )
        raw, content_type = multipart_file("media", "answer.webm", b"test-media", "video/webm", {
            "questionId": question["id"], "transcript": transcript, "durationSeconds": "45",
        })
        interview = call("POST", AI + path + "/answers", token=mentor["accessToken"],
                         raw_body=raw, content_type=content_type)
    result = post(AI, path + "/submit", mentor)
    assert result["outcome"] == "PASSED" and result["decidedBy"] == "AI", result
    return mentor, result, path


def auto_notification(mentor, result, interview_path):
    post(AI, interview_path + "/submit", mentor)
    notifications = get(MENTORING, "/api/mentoring/notifications", mentor)["items"]
    assert sum(n["type"] == "VERIFICATION_DECISION" for n in notifications) == 1, notifications
    assert get(PROFILE, f"/api/profile/mentor/{mentor['userId']}", mentor)["verificationStatus"] == "APPROVED"


def admin_result(admin, result):
    base = "/api/ai/admin/verification"
    queue = get(AI, base + "/queue?filter=DECIDED", admin)["items"]
    item = next((entry for entry in queue if entry["id"] == result["id"]), None)
    assert item and item["status"] == "APPROVED", item
    detail = get(AI, base + "/" + result["id"], admin)
    assert detail["decision"]["decidedBy"] == "AI" and detail["totalScore"] == result["totalScore"], detail


def revoke(admin, mentor, result):
    mentee = accepted_mentee(mentor, "revocation")
    topup(mentee, 500000)
    booked = book(mentee, mentor, at(5, 10))
    sid, mid = booked["id"], mentor["userId"]
    post(MENTORING, f"/api/mentoring/sessions/{sid}/confirm", mentor)
    old = next(t for t in get(AI, "/api/ai/verification/status", mentor)["tracks"] if t["domain"] == "backend")
    matching = f"/api/matching/mentors?menteeId={mentee['userId']}&limit=50"
    assert wait_indexed(mid, mentor["accessToken"], timeout=30)
    assert mid in {m["mentorId"] for m in get(MATCHING, matching, mentee)["mentors"]}
    old_domain = call("GET", f"{PROFILE}/internal/mentor/{mid}/domains", internal=True)["records"][0]
    path = f"/api/profile/admin/mentors/{mid}/revoke-verification"
    body = {"reason": "Thu hồi xác thực theo kịch bản kiểm thử"}
    try:
        post(PROFILE, path, mentor, body)
    except ApiError as error:
        assert error.status == 403, error
    else:
        raise AssertionError("Mentor can revoke verification")
    revoked = post(PROFILE, path, admin, body)
    assert revoked["mentor"]["verificationStatus"] == "REJECTED" and revoked["mentoringNotified"], revoked
    assert mid not in {m["mentorId"] for m in get(MATCHING, matching, mentee)["mentors"]}
    assert session(mentee, sid)["status"] == "CANCELLED" and float(wallet(mentee)["cash"]) == 500000
    assert post(PROFILE, path, admin, body)["mentoringNotified"]
    assert float(wallet(mentee)["cash"]) == 500000
    try:
        call("PUT", f"{PROFILE}/internal/mentor/{mid}/domains/backend/verification",
             {"state": "VERIFIED", "profileDomainId": old_domain["id"]}, internal=True)
    except ApiError as error:
        assert error.status == 404, error
    else:
        raise AssertionError("A stale interview restored verification")
    new = next(t for t in get(AI, "/api/ai/verification/status", mentor)["tracks"] if t["domain"] == "backend")
    assert new["id"] != old["id"] and new["stage"] == "READY", new
    restarted = post(AI, "/api/ai/verification/interviews", mentor, {"trackId": new["id"], "consent": True})
    assert restarted["status"] == "IN_PROGRESS", restarted
    assert get(AI, f"/api/ai/admin/verification/{result['id']}", admin)["id"] == result["id"]


def main():
    failures = []

    def check(case, func, *args):
        try:
            func(*args)
        except (AssertionError, ApiError) as error:
            print(f"{case} FAIL {error}", flush=True)
            failures.append(case)
        else:
            print(f"{case} PASS", flush=True)

    check("PROF-04", skill_guidance)
    mentor, result, path = scored_interview()
    admin = call("POST", AUTH + "/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    check("VER-02", auto_notification, mentor, result, path)
    check("VER-04", admin_result, admin, result)
    check("VER-05", revoke, admin, mentor, result)
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
