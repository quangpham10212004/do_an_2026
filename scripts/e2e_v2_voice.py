#!/usr/bin/env python3
"""
E2E v2.1 — phỏng vấn giọng nói (FR-7.7 mentor, FR-10.x mentee luyện phỏng vấn với AI).

    python3 scripts/e2e_v2_voice.py

Không có OPENAI_API_KEY (CI / docker mặc định, APP_ENV khác prod) => endpoint bắt đầu trả `voice: null`, script gửi bản ghi
giả lập thay cho trình duyệt: mentor giọng nói → PENDING_REVIEW (admin thấy mode VOICE); mentee luyện
miễn phí 1 lần → kết quả hiện ngay → lần thứ hai 409 PRACTICE_FREE_USED.
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
PRACTICE_GOOD = ("Dau tien toi lam ro yeu cau. Request gom header va body JSON, GET de doc, POST de tao, PUT idempotent. "
                 "Toi chon status code 201 vi client can biet resource moi. Trong du an o truong latency giam tu 300ms "
                 "xuong 80ms nho index; tuy nhien co trade-off nen toi so sanh hai phuong an. Cuoi cung toi viet unit test.")
PRACTICE_FILLER = "Ừm, em nghĩ là à kiểu như GET thì là để lấy dữ liệu, ừm."  # 15 từ, 5 từ đệm


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


def transcript(*answers):
    """Bản ghi như trình duyệt gửi: lời chào, rồi mỗi chủ đề = marker begin_topic + câu hỏi (+ câu trả lời nếu có)."""
    items = [{"role": "assistant", "text": "Xin chào, chúng ta bắt đầu buổi phỏng vấn nhé."}]
    for i, a in enumerate(answers, start=1):
        items += [{"role": "marker", "topicNo": i}, {"role": "assistant", "text": f"Câu hỏi chủ đề {i}?"}]
        if a:
            items.append({"role": "user", "text": a})
    return {"items": items}


def mentor_voice(at):
    print("Mentor — AI Interview bằng giọng nói")
    m = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.voice.m.{RUN}@test.local", "password": "Passw0rd!",
                                                    "role": "MENTOR", "fullName": f"V2 Voice {RUN}"})
    mt, uid = m["accessToken"], m["userId"]
    call("PUT", f"{PROFILE}/api/profile/mentor/{uid}", {
        "displayName": f"V2 Voice Mentor {RUN}", "domain": "backend", "skills": ["Java", "Redis"],
        "bio": "Backend engineer 8 nam, huong dan junior xay dung REST API.", "yearsExperience": 8,
        "hourlyRate": 0, "capacity": 3, "portfolioLinks": []}, token=mt)

    status, code = status_code(lambda: call("POST", f"{AI}/api/ai/interviews/voice",
                                            {"selfAnswerAcknowledged": True, "consentExternalAi": False}, token=mt))
    check("Thiếu đồng ý OpenAI xử lý âm thanh → 400 VOICE_CONSENT_REQUIRED", status == 400 and code == "VOICE_CONSENT_REQUIRED", (status, code))

    started = call("POST", f"{AI}/api/ai/interviews/voice", {"selfAnswerAcknowledged": True, "consentExternalAi": True}, token=mt)
    iv = started["interview"]
    check("Không có OPENAI_API_KEY (ngoài prod) → buổi VOICE được tạo, voice = null",
          started["voice"] is None and iv["mode"] == "VOICE" and iv["status"] == "IN_PROGRESS" and iv["consentExternalAi"], started)
    again = call("POST", f"{AI}/api/ai/interviews/voice", {"selfAnswerAcknowledged": True, "consentExternalAi": True}, token=mt)
    check("Gọi lại trong 30 phút → cùng buổi (kết nối lại)", again["interview"]["id"] == iv["id"], again["interview"]["id"])
    status, _ = status_code(lambda: call("POST", f"{AI}/api/ai/interviews", {"selfAnswerAcknowledged": True}, token=mt))
    check("Luồng chat đã gỡ: POST /api/ai/interviews → 404/405", status in (404, 405), status)

    status, code = status_code(lambda: call("POST", f"{AI}/api/ai/interviews/{iv['id']}/voice-transcript",
                                            {"items": [{"role": "user", "text": "alo"}]}, token=mt))
    check("Bản ghi không có chủ đề nào → 400 EMPTY_TRANSCRIPT", status == 400 and code == "EMPTY_TRANSCRIPT", (status, code))

    done = call("POST", f"{AI}/api/ai/interviews/{iv['id']}/voice-transcript", transcript(STRONG, STRONG, STRONG, None), token=mt)
    check("Bản ghi → PENDING_REVIEW, mỗi chủ đề một lượt, có điểm tổng",
          done["status"] == "PENDING_REVIEW" and len(done["turns"]) == 4 and done["overallScore"] is not None, done.get("status"))
    check("Mentor chưa thấy điểm từng câu khi admin chưa quyết định",
          all(t["score"] is None for t in done["turns"]) and not done["feedbackVisible"])
    p = call("GET", f"{PROFILE}/api/profile/mentor/{uid}", token=mt)
    check("Đồng bộ PENDING_REVIEW sang profile-service như chat", p["verificationStatus"] == "PENDING_REVIEW", p["verificationStatus"])

    detail = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=at)
    check("Admin thấy mode VOICE + rubric từng lượt", detail["mode"] == "VOICE" and all(t["rubric"] for t in detail["turns"]))
    pending = call("GET", f"{AI}/api/ai/admin/interviews?status=PENDING_REVIEW", token=at)
    check("Buổi giọng nói nằm trong danh sách chờ duyệt", any(i["id"] == iv["id"] for i in pending))
    status, code = status_code(lambda: call("POST", f"{AI}/api/ai/interviews/{iv['id']}/voice-transcript", transcript(STRONG), token=mt))
    check("Gửi bản ghi lần hai → 409 INTERVIEW_NOT_IN_PROGRESS", status == 409 and code == "INTERVIEW_NOT_IN_PROGRESS", (status, code))
    status, _ = status_code(lambda: call("POST", f"{AI}/api/ai/voice-interviews/session", {}, token=mt))
    check("Route prototype /api/ai/voice-interviews/session đã gỡ", status in (404, 405), status)


def mentee_practice(at):
    print("Mentee — Luyện phỏng vấn với AI")
    me = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.voice.e.{RUN}@test.local", "password": "Passw0rd!",
                                                     "role": "MENTEE", "fullName": f"V2 Practice {RUN}"})
    et = me["accessToken"]
    e = call("GET", f"{AI}/api/ai/practice-interviews/eligibility", token=et)
    check("Mentee mới: 1 buổi miễn phí, chưa dùng", e["freeLimit"] == 1 and e["used"] == 0 and e["canStart"] and e["reason"] is None, e)

    intake = {"interviewType": "BACKEND", "level": "FRESHER", "targetRole": "Backend Developer (Java)",
              "targetCompany": "FPT Software", "consentExternalAi": True}
    status, code = status_code(lambda: call("POST", f"{AI}/api/ai/practice-interviews", {**intake, "consentExternalAi": False}, token=et))
    check("Thiếu đồng ý → 400 VOICE_CONSENT_REQUIRED", status == 400 and code == "VOICE_CONSENT_REQUIRED", (status, code))
    status, code = status_code(lambda: call("POST", f"{AI}/api/ai/practice-interviews", {**intake, "targetRole": "x"}, token=et))
    check("Vị trí < 2 ký tự → 400 VALIDATION_ERROR", status == 400 and code == "VALIDATION_ERROR", (status, code))

    started = call("POST", f"{AI}/api/ai/practice-interviews", intake, token=et)
    pr = started["practice"]
    check("Bắt đầu → IN_PROGRESS, voice = null, 4 chủ đề theo BACKEND × FRESHER",
          started["voice"] is None and pr["status"] == "IN_PROGRESS" and len(pr["topics"]) == 4, started)
    again = call("POST", f"{AI}/api/ai/practice-interviews", {**intake, "interviewType": "BEHAVIORAL"}, token=et)["practice"]
    check("Bắt đầu lại trong 30 phút → cùng buổi, giữ intake cũ", again["id"] == pr["id"] and again["interviewType"] == "BACKEND")

    done = call("POST", f"{AI}/api/ai/practice-interviews/{pr['id']}/complete",
                transcript(PRACTICE_GOOD, PRACTICE_FILLER, PRACTICE_GOOD), token=et)
    r = done.get("result") or {}
    check("Nộp bản ghi → COMPLETED, kết quả hiện ngay", done["status"] == "COMPLETED" and r.get("overallScore") is not None, done.get("status"))
    check("Kết quả có 3 điểm mạnh, 3 việc cần cải thiện, rubric 4 tiêu chí từng câu",
          len(r.get("strengths", [])) == 3 and len(r.get("improvements", [])) == 3 and len(r.get("turns", [])) == 3
          and all(set(t["rubric"]) == {"technical", "problemSolving", "communication", "structure"} for t in r["turns"]), r)
    sp = r.get("speaking") or {}
    check("Báo cáo cách nói đếm từ đệm, số từ trung bình, câu dưới 20 từ",
          sp.get("fillerCount", 0) >= 5 and sp.get("avgWordsPerAnswer", 0) > 0 and sp.get("shortAnswers") == 1, sp)

    e = call("GET", f"{AI}/api/ai/practice-interviews/eligibility", token=et)
    check("Đã dùng lượt miễn phí → canStart = false, PRACTICE_FREE_USED",
          e["used"] == 1 and not e["canStart"] and e["reason"] == "PRACTICE_FREE_USED", e)
    status, code = status_code(lambda: call("POST", f"{AI}/api/ai/practice-interviews", intake, token=et))
    check("Bắt đầu lần hai → 409 PRACTICE_FREE_USED", status == 409 and code == "PRACTICE_FREE_USED", (status, code))

    mine = call("GET", f"{AI}/api/ai/practice-interviews/me", token=et)
    check("Lịch sử có buổi vừa luyện", [x["id"] for x in mine] == [pr["id"]], mine)
    admin_view = call("GET", f"{AI}/api/ai/practice-interviews/{pr['id']}", token=at)
    check("Admin xem được buổi luyện", admin_view["id"] == pr["id"] and admin_view["result"]["overallScore"] == r["overallScore"])
    mentor = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.voice.x.{RUN}@test.local", "password": "Passw0rd!",
                                                         "role": "MENTOR", "fullName": f"V2 X {RUN}"})
    status, _ = status_code(lambda: call("POST", f"{AI}/api/ai/practice-interviews", intake, token=mentor["accessToken"]))
    check("Mentor không dùng được luyện phỏng vấn của mentee → 403", status == 403, status)
    status, _ = status_code(lambda: call("GET", f"{AI}/api/ai/practice-interviews/{pr['id']}", token=mentor["accessToken"]))
    check("Người khác không xem được buổi luyện → 403", status == 403, status)


def main():
    t0 = time.time()
    print(f"E2E v2.1 voice run {RUN}\n")
    at = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    mentor_voice(at)
    mentee_practice(at)
    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
