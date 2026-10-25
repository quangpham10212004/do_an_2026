#!/usr/bin/env python3
"""
Kiểm thử chấp nhận end-to-end theo Definition of Done (SRD mục 6).

Gọi trực tiếp REST API của các service đang chạy (docker compose up) và in ra
bảng PASS/FAIL cho từng tiêu chí. Mỗi lần chạy tạo người dùng mới (email ngẫu nhiên)
nên có thể chạy lặp lại.

    python3 scripts/e2e_acceptance.py
"""
import sys
import time
from concurrent.futures import ThreadPoolExecutor
import uuid
from datetime import datetime, timedelta, timezone

from common import (AI, AUTH, LEARNING, MATCHING, MENTORING, PAYMENT, PROFILE, SAMPLE_CV_LINES, ApiError, call,
                    charge, make_pdf, multipart_file, round1_review, start_voice_interview, upload_video_chunks, finish_video, voice_transcript)

VN = timezone(timedelta(hours=7))
# US-03: form đặt lịch bắt buộc loại phiên + agenda 20–500 ký tự
BOOKING_FORM = {"sessionType": "CAREER_ADVICE", "agenda": "Review CV va dinh huong lo trinh backend Java"}
# US-14 (Sprint 2): yêu cầu mentoring bắt buộc goal (50–1000 ký tự), sessionType, frequency, expectedDurationMonths
REQUEST_FORM = {"goal": "Muon tro thanh backend developer Java, nam vung Spring Boot, REST API va microservices.",
                "sessionType": "CAREER_ADVICE", "frequency": "WEEKLY", "expectedDurationMonths": 3}
RUN = uuid.uuid4().hex[:6]
results = []


def check(dod, name, condition, detail=""):
    results.append((dod, name, bool(condition), detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def expect_error(fn, status):
    try:
        fn()
    except ApiError as e:
        return e.status == status, e.body
    return False, "no error"


def wait_indexed(user_id, token, after=None, timeout=30):
    """
    Chờ matching-service lập xong chỉ mục embedding cho hồ sơ.

    profile-service báo thay đổi theo kiểu bắn-rồi-quên nên chỉ mục là nhất quán
    cuối cùng (eventually consistent): sau khi lưu hồ sơ phải hỏi matching-service
    chứ không đọc trạng thái từ phản hồi của profile-service nữa.

    `after` = mốc indexedAt của lần lập chỉ mục trước; truyền vào để chờ ĐÚNG lần
    lập chỉ mục mới (nếu không, hàm trả về ngay vì chỉ mục cũ vẫn đang UPDATED).
    Trả về indexedAt khi sẵn sàng, None nếu quá hạn.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        res = call("GET", f"{MATCHING}/api/matching/index-status?userId={user_id}", token=token)
        if res["status"] == "UPDATED" and res["indexedAt"] != after:
            return res["indexedAt"]
        time.sleep(0.5)
    return None


def register(role, name, referral=None):
    email = f"e2e.{role.lower()}.{name}.{RUN}@test.local"
    res = call("POST", f"{AUTH}/api/auth/register",
               {"email": email, "password": "Passw0rd!", "role": role, "fullName": f"E2E {name}", "referralCode": referral})
    return res


def next_slot(hours_ahead=26):
    t = (datetime.now(VN) + timedelta(hours=hours_ahead)).replace(minute=0, second=0, microsecond=0)
    return t


def main():
    t0 = time.time()
    print(f"E2E run {RUN}\n")

    # ---------------- DoD 1: Auth & RBAC ----------------
    print("DoD 1 — Đăng ký/đăng nhập 3 vai trò")
    referrer = register("MENTEE", "referrer")
    mentee = register("MENTEE", "mentee")
    mentor = register("MENTOR", "mentor")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})
    check(1, "Đăng ký mentee & mentor trả JWT", mentee["accessToken"] and mentor["role"] == "MENTOR")
    login = call("POST", f"{AUTH}/api/auth/login", {"email": mentee["email"], "password": "Passw0rd!"})
    check(1, "Đăng nhập mentee", login["userId"] == mentee["userId"])
    check(1, "Đăng nhập admin (tài khoản seed)", admin["role"] == "ADMIN")
    ok, _ = expect_error(lambda: call("POST", f"{AUTH}/api/auth/register",
                                      {"email": mentee["email"], "password": "Passw0rd!", "role": "MENTEE"}), 409)
    check(1, "Email trùng bị từ chối (409)", ok)
    ok, _ = expect_error(lambda: call("GET", f"{AUTH}/api/auth/admin/users", token=mentee["accessToken"]), 403)
    check(1, "RBAC: mentee không gọi được API admin (403)", ok)
    ok, _ = expect_error(lambda: call("GET", f"{PROFILE}/internal/profile-summary/{mentee['userId']}", token=mentee["accessToken"]), 403)
    check(1, "Endpoint /internal chặn JWT người dùng (403)", ok)
    refreshed = call("POST", f"{AUTH}/api/auth/refresh", {"refreshToken": mentee["refreshToken"]})
    ok, _ = expect_error(lambda: call("POST", f"{AUTH}/api/auth/refresh", {"refreshToken": mentee["refreshToken"]}), 401)
    check(1, "Refresh token xoay vòng, token cũ không dùng lại được", refreshed["accessToken"] and ok)
    mentee_token = call("POST", f"{AUTH}/api/auth/login", {"email": mentee["email"], "password": "Passw0rd!"})["accessToken"]
    mentor_token = mentor["accessToken"]
    admin_token = admin["accessToken"]

    # ---------------- DoD 2: Career profile + embedding ----------------
    print("\nDoD 2 — Career Profile & sinh embedding")
    profile_body = {
        "displayName": "E2E Mentee", "domain": "backend", "currentLevel": "BEGINNER", "skills": ["Java", "SQL"],
        "goal": "Tro thanh backend developer Java va hoc system design", "portfolioLinks": []}
    mp = call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", profile_body, token=mentee_token)
    check(2, "Hồ sơ mentee không lộ dữ liệu embedding (thuộc matching-service)",
          "embeddingStatus" not in mp and "embeddingUpdatedAt" not in mp, sorted(mp))
    indexed_at = wait_indexed(mentee["userId"], mentee_token)
    check(2, "Mentee tạo hồ sơ, matching-service lập chỉ mục embedding ngay sau đó", bool(indexed_at))
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", profile_body, token=mentee_token)
    unchanged = call("POST", f"{MATCHING}/internal/embeddings/reindex",
                     {"userId": mentee["userId"], "role": "MENTEE"}, internal=True)
    check(2, "NFR-7: lưu lại hồ sơ không đổi thì không sinh lại embedding",
          unchanged["status"] == "UNCHANGED" and unchanged["indexedAt"] == indexed_at, unchanged)
    ok, _ = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentee/{mentor['userId']}", {
        "displayName": "x", "domain": "backend", "goal": "x"}, token=mentee_token), 403)
    check(2, "Không sửa được hồ sơ người khác (403)", ok)

    # ---------------- DoD 3: CV + chatbot enrichment ----------------
    print("\nDoD 3 — Upload CV, chatbot hỏi thêm, tổng hợp & re-embedding")
    # Sprint 2 US-19: consentExternalAi bắt buộc (false => rule-based, tất định cho e2e)
    body, ctype = multipart_file("file", "cv.pdf", make_pdf(SAMPLE_CV_LINES), fields={"consentExternalAi": "false"})
    upload = call("POST", f"{AI}/api/ai/mentee/{mentee['userId']}/cv-upload", token=mentee_token,
                  raw_body=body, content_type=ctype)
    parsed = upload["cv"]["parsed"]
    check(3, "Parse CV: trích xuất kỹ năng", {"Java", "Spring Boot", "Docker"} <= set(parsed["skills"]), parsed["skills"])
    check(3, "Parse CV: trích xuất dự án & kinh nghiệm", len(parsed["projects"]) >= 2 and parsed["yearsExperience"] is not None, parsed)
    # Sprint 2 US-20: upload chỉ parse (chưa có hội thoại); duyệt thông tin (giữ nguyên) rồi mới bắt đầu chatbot
    check(3, "Upload chỉ parse, chưa mở chatbot (chờ người dùng duyệt)", upload["conversation"] is None)
    call("PUT", f"{AI}/api/ai/cv/{upload['cv']['id']}/confirmed-fields", {
        "role": parsed["currentRole"], "skills": parsed["skills"], "yearsExperience": parsed["yearsExperience"],
        "projects": parsed["projects"], "education": parsed["education"]}, token=mentee_token)
    conv = call("POST", f"{AI}/api/ai/cv/{upload['cv']['id']}/enrichment-conversation", token=mentee_token)["conversation"]
    first_q = conv["currentQuestion"]["question"]
    check(3, "Câu hỏi đầu dựa trên CV (nhắc lại kỹ năng đã có, không hỏi lại)", "Java" in first_q, first_q)
    answers = ["Toi muon lam backend developer Java trong 6 thang toi", "System design va microservices",
               "Chua tu tin khi thiet ke database", "Muon review code va luyen phong van, 2 buoi moi thang",
               "Khong co gi them"]
    slots = []
    while conv["status"] == "IN_PROGRESS":
        slots.append(conv["currentQuestion"]["slot"])
        conv = call("POST", f"{AI}/api/ai/enrichment/conversations/{conv['id']}/answers",
                    {"answer": answers[len(slots) - 1]}, token=mentee_token)
    check(3, f"Hội thoại kết thúc sau đúng {conv['maxTurns']} lượt, không lặp slot", len(slots) == conv["maxTurns"] and len(set(slots)) == len(slots), slots)
    check(3, "Mốc thời gian đã nêu ('6 tháng') nên không hỏi lại TIMELINE", "TIMELINE" not in slots, slots)
    check(3, "Tổng hợp goal chuẩn hoá", conv["enrichedGoal"] and "Nền tảng hiện có" in conv["enrichedGoal"])
    # Sprint 2 US-21: goal là bản nháp — hồ sơ chỉ đổi sau khi mentee "Dùng mục tiêu này"
    profile_draft = call("GET", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", token=mentee_token)
    check(3, "Goal nháp chưa ghi vào hồ sơ trước khi xác nhận", conv["goalStatus"] == "DRAFT"
          and not conv["profileSynced"] and profile_draft["goal"] != conv["enrichedGoal"], conv["goalStatus"])
    conv = call("POST", f"{AI}/api/ai/enrichment/conversations/{conv['id']}/confirm-goal",
                {"goal": conv["enrichedGoal"]}, token=mentee_token)
    profile_after = call("GET", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", token=mentee_token)
    check(3, "Goal được ghi vào profile-service + gộp kỹ năng từ CV", conv["profileSynced"] and profile_after["goal"] == conv["enrichedGoal"]
          and "Spring Boot" in profile_after["skills"])
    reindexed_at = wait_indexed(mentee["userId"], mentee_token, after=indexed_at)
    check(3, "Embedding được sinh lại sau enrichment", bool(reindexed_at) and reindexed_at != indexed_at)

    # ---------------- DoD 4 & 5: Mentor profile + AI interview + admin review ----------------
    print("\nDoD 4/5 — Hồ sơ mentor, AI Interview multi-turn, admin review, lọc matching")
    call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", {
        "displayName": f"E2E Mentor {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot", "Redis", "System Design"],
        "bio": "Backend engineer 8 nam kinh nghiem, xay dung he thong microservices va huong dan junior.",
        "yearsExperience": 8, "hourlyRate": 200000, "capacity": 2, "isAvailable": True, "portfolioLinks": []}, token=mentor_token)
    call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}/availability", {
        "slots": [{"dayOfWeek": d, "startTime": "06:00", "endTime": "23:00"} for d in range(1, 8)]}, token=mentor_token)
    ok, _ = expect_error(lambda: call("PUT", f"{PROFILE}/api/profile/mentor/{mentor['userId']}/availability", {
        "slots": [{"dayOfWeek": 1, "startTime": "08:00", "endTime": "10:00"}, {"dayOfWeek": 1, "startTime": "09:00", "endTime": "11:00"}]},
        token=mentor_token), 400)
    check(4, "Lịch rảnh chồng lấn bị từ chối", ok)

    def mentor_ids_in_matching():
        res = call("GET", f"{MATCHING}/api/matching/mentors?menteeId={mentee['userId']}&limit=50", token=mentee_token)
        return {m["mentorId"] for m in res["mentors"]}, res

    ids, _ = mentor_ids_in_matching()
    check(5, "Mentor chưa qua AI Interview KHÔNG xuất hiện trong matching", mentor["userId"] not in ids)
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/requests",
                                      {"mentorId": mentor["userId"], **REQUEST_FORM}, token=mentee_token), 400)
    check(5, "Không gửi được yêu cầu tới mentor chưa xác thực", ok)

    started = start_voice_interview(mentor_token)
    interview = started["interview"]
    check(4, "Phỏng vấn giọng nói được tạo (FR-7.7): IN_PROGRESS, mode VOICE", interview["status"] == "IN_PROGRESS" and interview["mode"] == "VOICE")
    interview = call("POST", f"{AI}/api/ai/interviews/{interview['id']}/voice-transcript",
                     voice_transcript(interview["maxTurns"]), token=mentor_token)
    upload_video_chunks(mentor_token, interview["id"])
    finish_video(mentor_token, interview["id"])
    check(4, "Điểm từng câu bị ẩn với mentor khi chờ duyệt (PRD-AIV-5)", all(t["score"] is None for t in interview["turns"]))
    check(4, f"Chấm đủ {interview['maxTurns']} chủ đề theo kế hoạch (FR-7.3)", len(interview["turns"]) == interview["maxTurns"])
    check(4, "Engine AI được ghi nhận (ai-service: DEEPSEEK hoặc RULE_BASED)", interview["engine"] in ("DEEPSEEK", "RULE_BASED"),
          interview["engine"])
    check(4, "Tổng hợp điểm + nhận xét, chờ admin duyệt (FR-7.4)",
          interview["status"] == "PENDING_REVIEW" and interview["overallScore"] is not None and interview["summary"], interview.get("overallScore"))
    mentor_profile = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor_token)
    check(4, "Trạng thái xác thực mentor = PENDING_REVIEW", mentor_profile["verificationStatus"] == "PENDING_REVIEW")
    ids, _ = mentor_ids_in_matching()
    check(5, "Mentor chờ duyệt vẫn chưa xuất hiện trong matching (NFR-8)", mentor["userId"] not in ids)
    pending = call("GET", f"{AI}/api/ai/admin/verification/applications?status=ROUND1_REVIEW", token=admin_token)
    check(4, "Admin thấy đợt xác thực trong danh sách chờ duyệt vòng 1", any(a["id"] == interview["applicationId"] for a in pending))
    round1_review(admin_token, interview, "PASS", "Tra loi tot")
    mentor_profile = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor_token)
    check(4, "Admin duyệt → mentor được kích hoạt (APPROVED)", mentor_profile["verificationStatus"] == "APPROVED")

    # ---------------- DoD 6 & 7: Matching ----------------
    print("\nDoD 6/7 — Danh sách đề xuất có điểm, lý do, đã lọc ràng buộc")
    started = time.time()
    ids, matching = mentor_ids_in_matching()
    latency = time.time() - started
    check(6, "Mentor vừa được duyệt xuất hiện trong matching", mentor["userId"] in ids)
    top = next(m for m in matching["mentors"] if m["mentorId"] == mentor["userId"])
    check(6, "Có similarityScore, finalScore và lý do đề xuất", 0 < top["similarityScore"] <= 1 and top["finalScore"] > 0 and top["reasons"], top)
    check(6, "Kết quả sắp xếp giảm dần theo finalScore",
          [m["finalScore"] for m in matching["mentors"]] == sorted([m["finalScore"] for m in matching["mentors"]], reverse=True))
    check(7, "Không mentor nào khác lĩnh vực / hết chỗ / chưa duyệt trong kết quả",
          all(m["domain"] == "backend" for m in matching["mentors"]))
    check(7, "Thống kê pipeline cho thấy mentor chưa duyệt bị hard filter loại (notVerified)",
          matching["pipeline"]["excluded"].get("notVerified", 0) >= 1, matching["pipeline"])
    check(6, f"NFR-1: truy vấn matching < 2 giây ({latency * 1000:.0f} ms)", latency < 2)

    # ---------------- DoD 10 (phần 1): referral registration ----------------
    print("\nDoD 10 — Referral")
    # Bản chốt v2.0 §11: mã giới thiệu theo cặp (người giới thiệu, mentor), chỉ cấp khi đã học xong ≥ 1 buổi thường đã trả
    # với mentor đó; dùng ở yêu cầu đặt buổi thường đầu tiên của người được giới thiệu (phần 2 bên dưới).
    referred = register("MENTEE", "referred")
    bad = register("MENTEE", "badref")
    ok, err = expect_error(lambda: call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": mentor["userId"]},
                                        token=referrer["accessToken"]), 409)
    check(10, "Chưa học với mentor thì chưa có mã giới thiệu (409 REFERRAL_NOT_ELIGIBLE)", ok, err)
    referred_token = referred["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentee/{referred['userId']}", {
        "displayName": "E2E Referred", "domain": "backend", "goal": "Hoc Java backend", "skills": ["Java"], "portfolioLinks": []},
        token=referred_token)

    # ---------------- DoD 8: request → accept → book → pay → confirmed ----------------
    print("\nDoD 8 — Yêu cầu → chấp nhận → đặt lịch → thanh toán sandbox → xác nhận")
    req = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"], "message": "Xin chao", **REQUEST_FORM}, token=referred_token)
    check(8, "Mentee gửi yêu cầu mentoring", req["status"] == "PENDING")
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": referred["userId"], "mentorId": mentor["userId"], "scheduledAt": next_slot().isoformat(), "durationMinutes": 60, **BOOKING_FORM},
        token=referred_token), 400)
    check(8, "Chưa được chấp nhận thì không đặt lịch được", ok)
    req = call("POST", f"{MENTORING}/api/mentoring/requests/{req['id']}/respond", {"decision": "ACCEPT"}, token=mentor_token)
    check(8, "Mentor chấp nhận yêu cầu", req["status"] == "ACCEPTED")

    night = next_slot().replace(hour=23, minute=30)
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": referred["userId"], "mentorId": mentor["userId"], "scheduledAt": night.isoformat(), "durationMinutes": 60, **BOOKING_FORM},
        token=referred_token), 409)
    check(8, "Đặt ngoài lịch rảnh bị từ chối (409)", ok)
    slot = next_slot().replace(hour=10)
    slots_url = f"{MENTORING}/api/mentoring/mentors/{mentor['userId']}/available-slots?durationMinutes=60&days=7"
    free = [datetime.fromisoformat(x["startAt"]) for x in call("GET", slots_url, token=referred_token)["slots"]]
    check(8, "Khung giờ trống: có giờ trong lịch rảnh, không có giờ ngoài lịch (FR-5.4)",
          slot in free and night not in free and all(t > datetime.now(VN) for t in free), free[:4])
    session = call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": referred["userId"], "mentorId": mentor["userId"], "scheduledAt": slot.isoformat(), "durationMinutes": 60,
        "topic": "Review CV", **BOOKING_FORM}, token=referred_token)
    check(8, "Tạo phiên PENDING (ví trống) với giá = 200.000đ / buổi 60 phút", session["status"] == "PENDING" and float(session["price"]) == 200000, session)
    free = [datetime.fromisoformat(x["startAt"]) for x in call("GET", slots_url, token=referred_token)["slots"]]
    check(8, "Khung giờ đã đặt (và giờ chồng lấn) biến mất khỏi danh sách trống",
          slot not in free and slot + timedelta(minutes=30) not in free and slot - timedelta(minutes=60) not in free, free[:6])
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": (slot + timedelta(minutes=30)).isoformat(),
        "durationMinutes": 60, **BOOKING_FORM}, token=mentee_token), 400)
    check(8, "Mentee chưa được chấp nhận không đặt được lịch với mentor", ok)

    expiry = (datetime.now() + timedelta(days=800)).strftime("%m/%y")
    declined = charge(session["id"], {
        "cardNumber": "4000 0000 0000 0002", "expiry": expiry, "cvv": "123"}, referred_token)
    check(8, "Thẻ bị từ chối khi nạp ví → giao dịch nạp FAILED", declined["status"] == "FAILED" and declined["failureReason"] == "CARD_DECLINED")
    still = call("GET", f"{MENTORING}/api/mentoring/sessions/{session['id']}", token=referred_token)
    check(8, "Nạp ví thất bại thì phiên vẫn PENDING (FR-6.2)", still["status"] == "PENDING")
    ok, _ = expect_error(lambda: charge(session["id"], {
        "cardNumber": "4242424242424242", "expiry": expiry, "cvv": "123"}, referred_token, amount=1000), 400)
    check(8, "Client sửa số tiền bị từ chối (AMOUNT_MISMATCH)", ok)
    paid = charge(session["id"], {
        "cardNumber": "4242 4242 4242 4242", "expiry": expiry, "cvv": "123"}, referred_token)
    check(8, "Nạp ví + trả từ ví → giao dịch học phí SUCCESS", paid["status"] == "SUCCESS" and paid["provider"] == "WALLET")
    confirmed = call("GET", f"{MENTORING}/api/mentoring/sessions/{session['id']}", token=referred_token)
    check(8, "Booking được xác nhận sau khi mentor xác nhận (dev) — học phí đã tạm giữ", confirmed["status"] == "CONFIRMED")
    ok, err = expect_error(lambda: call("POST", f"{PAYMENT}/api/payment/wallet/pay", {"sessionId": session["id"]},
                                        token=referred_token), 409)
    check(8, "Không trả học phí trùng 1 phiên từ ví (409)", ok, err)

    # ---------------- DoD 9: complete & review ----------------
    print("\nDoD 9 — Hoàn thành phiên & đánh giá")
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{session['id']}/review",
                                      {"rating": 5}, token=referred_token), 409)
    check(9, "Chưa hoàn thành phiên thì chưa đánh giá được", ok)
    # US-12: không còn hoàn thành trước giờ kết thúc — dời phiên về quá khứ bằng endpoint dev, mentor "complete"
    # (= trả lời HELD) và mentee xác nhận HELD → COMPLETED.
    call("POST", f"{MENTORING}/internal/dev/sessions/{session['id']}/joined", {"mentor": True, "mentee": True}, internal=True)   # v2.0: nhật ký vào phòng
    call("POST", f"{MENTORING}/internal/dev/sessions/{session['id']}/shift", {"endedMinutesAgo": 5}, internal=True)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{session['id']}/complete", token=mentor_token)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{session['id']}/attendance", {"answer": "HELD"}, token=referred_token)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{session['id']}/review", {"rating": 4, "comment": "Rat huu ich"}, token=referred_token)
    mentor_profile = call("GET", f"{PROFILE}/api/profile/mentor/{mentor['userId']}", token=mentor_token)
    # US-41 (PRD-REV-5): rating đồng bộ là trung bình Bayes (prior 3 đánh giá ở trung bình nền tảng), không còn bằng
    # điểm thô của 1 đánh giá — chỉ kiểm tra rating đã được cập nhật và số đánh giá đúng.
    check(9, "Mentee đánh giá được; rating mentor được cập nhật", mentor_profile["ratingCount"] == 1 and 1 <= mentor_profile["rating"] <= 5)
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/sessions/{session['id']}/review",
                                      {"rating": 5}, token=referred_token), 409)
    check(9, "Không đánh giá 2 lần cho 1 phiên", ok)
    history = call("GET", f"{MENTORING}/api/mentoring/sessions", token=referred_token)
    check(9, "Lịch sử phiên hiển thị phiên đã hoàn thành kèm đánh giá (FR-5.7)",
          any(s["id"] == session["id"] and s["status"] == "COMPLETED" and s["reviewRating"] == 4 for s in history))
    notes = call("GET", f"{MENTORING}/api/mentoring/notifications", token=referred_token)
    check(9, "Mentee nhận thông báo (chấp nhận, xác nhận phiên...) (FR-5.5)", notes["unreadCount"] >= 2)

    # ---------------- Refund flow ----------------
    print("\nBổ sung — Huỷ phiên đã thanh toán → hoàn tiền; sức chứa")
    s2 = call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": referred["userId"], "mentorId": mentor["userId"], "scheduledAt": (slot + timedelta(days=4)).isoformat(),
        "durationMinutes": 60, **BOOKING_FORM}, token=referred_token)
    charge(s2["id"], {
        "cardNumber": "4242424242424242", "expiry": expiry, "cvv": "123"}, referred_token)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{s2['id']}/cancel", {"reason": "Ban viec"}, token=referred_token)
    txs = call("GET", f"{PAYMENT}/api/payment/sessions/{s2['id']}/transactions", token=referred_token)
    check(8, "Huỷ phiên đã thanh toán → giao dịch REFUNDED (FR-6.3)", any(t["status"] == "REFUNDED" for t in txs), txs)
    # Sức chứa: mentor capacity=2, đã nhận 1 → nhận thêm 1 → mentee thứ 3 bị CAPACITY_FULL
    r2 = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"], **REQUEST_FORM}, token=mentee_token)
    call("POST", f"{MENTORING}/api/mentoring/requests/{r2['id']}/respond", {"decision": "ACCEPT"}, token=mentor_token)
    r3 = call("POST", f"{MENTORING}/api/mentoring/requests", {"mentorId": mentor["userId"], **REQUEST_FORM}, token=referrer["accessToken"])
    ok, _ = expect_error(lambda: call("POST", f"{MENTORING}/api/mentoring/requests/{r3['id']}/respond",
                                      {"decision": "ACCEPT"}, token=mentor_token), 409)
    check(7, "Mentor đủ sức chứa không nhận thêm mentee (CAPACITY_FULL)", ok)

    # ---------------- DoD 10 (phần 2): referral theo mentor ----------------
    # `referred` đã học xong 1 buổi thường đã trả với mentor → có mã cho mentor; `mentee` (vừa được nhận) dùng mã ở buổi đầu.
    code = call("POST", f"{PAYMENT}/api/payment/referrals/codes", {"mentorId": mentor["userId"]}, token=referred_token)
    check(10, "Học xong 1 buổi đã trả → có mã giới thiệu riêng cho mentor", code["mentorId"] == mentor["userId"] and len(code["code"]) == 8, code)
    rs = call("POST", f"{MENTORING}/api/mentoring/sessions", {
        "menteeId": mentee["userId"], "mentorId": mentor["userId"], "scheduledAt": (slot + timedelta(days=5)).isoformat(),
        "durationMinutes": 60, "referralCode": code["code"], **BOOKING_FORM}, token=mentee_token)
    check(10, "Người được giới thiệu dùng mã ở buổi đầu, không giảm giá", float(rs["price"]) == 200000, rs["price"])
    charge(rs["id"], {"cardNumber": "4242 4242 4242 4242", "expiry": expiry, "cvv": "123"}, mentee_token)
    call("POST", f"{MENTORING}/internal/dev/sessions/{rs['id']}/joined", {"mentor": True, "mentee": True}, internal=True)
    call("POST", f"{MENTORING}/internal/dev/sessions/{rs['id']}/shift", {"endedMinutesAgo": 5}, internal=True)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/complete", token=mentor_token)
    call("POST", f"{MENTORING}/api/mentoring/sessions/{rs['id']}/attendance", {"answer": "HELD"}, token=mentee_token)
    time.sleep(3)   # final-state COMPLETED tới payment-service qua outbox
    promo_before = float(call("GET", f"{PAYMENT}/api/payment/wallet", token=referred_token)["promo"])
    call("POST", f"{PAYMENT}/internal/dev/earnings/{rs['id']}/age", {"days": 8}, internal=True)
    call("POST", f"{PAYMENT}/internal/dev/jobs/referral-eval", {}, internal=True)
    ov = call("GET", f"{PAYMENT}/api/payment/referrals/me", token=referred_token)
    row = next((r for r in ov["referrals"] if r["sessionId"] == rs["id"]), None)
    promo_after = float(call("GET", f"{PAYMENT}/api/payment/wallet", token=referred_token)["promo"])
    check(10, "Buổi hợp lệ qua 7 ngày không hoàn tiền → referral QUALIFIED, người giới thiệu +30.000đ khuyến mãi",
          row is not None and row["status"] == "QUALIFIED" and promo_after == promo_before + 30000, (row, promo_before, promo_after))
    call("PUT", f"{PROFILE}/api/profile/mentee/{referrer['userId']}", {
        "displayName": "E2E Referrer", "domain": "backend", "goal": "Hoc Java Spring Boot backend", "skills": ["Java"], "portfolioLinks": []},
        token=referrer["accessToken"])
    ids = {m["mentorId"] for m in call("GET", f"{MATCHING}/api/matching/mentors?menteeId={referrer['userId']}&limit=50",
                                       token=referrer["accessToken"])["mentors"]}
    check(7, "Mentor đã đầy sức chứa bị loại khỏi kết quả matching", mentor["userId"] not in ids)

    # Đặt lịch đồng thời: 2 mentee (đều đã được chấp nhận) cùng đặt 1 khung giờ → đúng 1 người thành công
    race_slot = (slot + timedelta(days=3)).isoformat()

    def book_race(user_id, token):
        try:
            call("POST", f"{MENTORING}/api/mentoring/sessions", {
                "menteeId": user_id, "mentorId": mentor["userId"], "scheduledAt": race_slot, "durationMinutes": 60, **BOOKING_FORM},
                token=token)
            return 201
        except ApiError as e:
            return e.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(lambda args: book_race(*args),
                                   [(referred["userId"], referred_token), (mentee["userId"], mentee_token)]))
    check(8, "Đặt lịch đồng thời cùng khung giờ: đúng 1 thành công, 1 bị từ chối (409)", statuses == [201, 409], statuses)

    # ---------------- Learning hub ----------------
    print("\nLearning Hub")
    courses = call("GET", f"{LEARNING}/api/learning/courses", token=mentee_token)
    course = call("POST", f"{LEARNING}/api/learning/courses/{courses[0]['id']}/enroll", token=mentee_token)
    course = call("POST", f"{LEARNING}/api/learning/materials/{course['materials'][0]['id']}/complete", token=mentee_token)
    expected = round(100 / len(course["materials"]), 1)
    progress = call("GET", f"{LEARNING}/api/learning/courses/{course['id']}/progress/{mentee['userId']}", token=mentee_token)
    check(0, f"Đăng ký khoá học & theo dõi tiến độ ({progress['percentComplete']}%)", abs(progress["percentComplete"] - expected) < 0.11)
    roadmaps = call("GET", f"{LEARNING}/api/learning/roadmaps", token=mentee_token)
    check(0, "Roadmap có sẵn dữ liệu seed", len(roadmaps) >= 3)

    # ---------------- Admin lock ----------------
    print("\nAdmin")
    call("PATCH", f"{AUTH}/api/auth/admin/users/{bad['userId']}/status", {"status": "LOCKED", "reason": "E2E: vi pham chinh sach"}, token=admin_token)
    ok, _ = expect_error(lambda: call("POST", f"{AUTH}/api/auth/login", {"email": bad["email"], "password": "Passw0rd!"}), 403)
    check(1, "Admin khoá tài khoản → không đăng nhập được (FR-1.5)", ok)

    # ---------------- Summary ----------------
    passed = sum(1 for r in results if r[2])
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    failed = [r for r in results if not r[2]]
    for dod, name, _, detail in failed:
        print(f"  FAIL (DoD {dod}): {name} {detail}")
    return 0 if not failed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
