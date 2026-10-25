"""Tiện ích dùng chung cho script seed/e2e — chỉ dùng thư viện chuẩn Python."""
import json
import re
import os
import random
import urllib.error
import urllib.request
import uuid

AUTH = os.getenv("AUTH_URL", "http://localhost:8081")
PROFILE = os.getenv("PROFILE_URL", "http://localhost:8082")
MENTORING = os.getenv("MENTORING_URL", "http://localhost:8083")
PAYMENT = os.getenv("PAYMENT_URL", "http://localhost:8084")
LEARNING = os.getenv("LEARNING_URL", "http://localhost:8085")
MATCHING = os.getenv("MATCHING_URL", "http://localhost:8090")
AI = os.getenv("AI_URL", "http://localhost:8091")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key")


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


MIN_OVERRULE_NOTE = 10


_LOGIN = re.compile(r"/api/auth/login/?$")
_SESSION_REVIEW = re.compile(r"/api/mentoring/sessions/[^/]+/review/?$")


def _review_compat(method, url, body):
    """
    Tương thích US-41 (Sprint 5): đánh giá mới bắt buộc 3 điểm thành phần (kiến thức, truyền đạt, chuẩn bị). Script
    cũ chỉ gửi {rating, comment} được bổ sung điểm thành phần = rating. Script kiểm tra US-41 luôn gửi đủ.
    """
    if method == "POST" and isinstance(body, dict) and _SESSION_REVIEW.search(url) and "knowledge" not in body:
        r = body.get("rating")
        return {**body, "knowledge": r, "clarity": r, "preparation": r}
    return body


_REGISTER = re.compile(r"/api/auth/register/?$")
# Header chỉ dùng phía script (không gửi lên server): giữ tài khoản vừa đăng ký ở trạng thái CHƯA xác thực email.
KEEP_UNVERIFIED = "X-E2E-Keep-Unverified"


def _auto_verify(url, res):
    """
    Tương thích US-39 (Sprint 4): tài khoản chưa xác thực email không gửi yêu cầu / đặt lịch / thanh toán được. Các
    script seed/e2e đăng ký rồi dùng ngay, nên sau POST /api/auth/register (môi trường dev trả emailVerificationToken)
    tự xác thực email rồi refresh để access token mang claim ev=true. Script kiểm tra chính quy tắc này
    (e2e_s4_ai_auth.py) gửi header KEEP_UNVERIFIED để bỏ qua bước này.
    """
    token = res.get("emailVerificationToken") if isinstance(res, dict) else None
    if not token:
        return res
    base = url[: url.index("/api/auth/register")]
    call("GET", f"{base}/api/auth/verify-email?token={token}")
    fresh = call("POST", f"{base}/api/auth/refresh", {"refreshToken": res["refreshToken"]})
    return {**res, **fresh, "emailVerified": True}


def call(method, url, body=None, token=None, internal=False, raw_body=None, content_type=None, headers=None):
    body = _review_compat(method, url, body) if raw_body is None else body
    headers = dict(headers or {})
    keep_unverified = headers.pop(KEEP_UNVERIFIED, None) is not None
    headers = {"Accept": "application/json", **headers}
    if _LOGIN.search(url) and "X-Forwarded-For" not in headers:
        # US-46: đăng nhập bị giới hạn 5 lần / phút / IP — mỗi lần e2e đăng nhập giả lập một client (IP) khác nhau.
        headers["X-Forwarded-For"] = f"10.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"
    data = None
    if raw_body is not None:
        data = raw_body
        headers["Content-Type"] = content_type
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if internal:
        headers["X-Internal-Token"] = INTERNAL_API_KEY
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            text = res.read().decode()
            result = json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = text
        raise ApiError(e.code, parsed) from None
    if method == "POST" and _REGISTER.search(url) and not keep_unverified:
        result = _auto_verify(url, result)
    return result


def charge(session_id, card, token, amount=None, idempotency_key=None):
    """
    Tương thích script cũ (bản chốt v2.0: học phí chỉ trả từ ví): nạp ví đủ giá phiên bằng thẻ sandbox `card` → trả từ ví
    (POST /api/payment/wallet/pay → phiên AWAITING_MENTOR) → mentor xác nhận qua endpoint dev (script cũ không giữ token mentor)
    → trả giao dịch học phí như /charge cũ. Thẻ bị từ chối → trả giao dịch NẠP VÍ thất bại (status FAILED, failureReason) và
    không trả học phí. Script kiểm tra chính luồng ví/xác nhận (e2e_v2_*.py) gọi thẳng API, không qua helper này.
    """
    session = call("GET", f"{MENTORING}/internal/sessions/{session_id}", internal=True)
    if session["status"] in ("AWAITING_MENTOR", "CONFIRMED"):
        # Ví đã đủ tiền nên học phí đã được tạm giữ ngay lúc đặt lịch → chỉ cần mentor xác nhận (nếu chưa)
        if session["status"] == "AWAITING_MENTOR":
            call("POST", f"{MENTORING}/internal/dev/sessions/{session_id}/mentor-confirm", {}, internal=True)
        return call("GET", f"{PAYMENT}/api/payment/sessions/{session_id}/transactions", token=token)[0]
    price = int(float(session["price"]))
    wallet = call("GET", f"{PAYMENT}/api/payment/wallet", token=token)
    short = price - int(float(wallet["cash"])) - int(float(wallet["promo"]))
    if short > 0:
        topup = max(-(-short // 10000) * 10000, 50000)
        t = call("POST", f"{PAYMENT}/api/payment/wallet/topups", {"amount": topup, "provider": "SANDBOX", "card": card}, token=token)
        if t["status"] != "SUCCESS":
            return t
    body = {"sessionId": session_id}
    if amount is not None:
        body["amount"] = amount
    tx = call("POST", f"{PAYMENT}/api/payment/wallet/pay", body, token=token)
    after = call("GET", f"{MENTORING}/internal/sessions/{session_id}", internal=True)
    if after["status"] == "AWAITING_MENTOR":
        call("POST", f"{MENTORING}/internal/dev/sessions/{session_id}/mentor-confirm", {}, internal=True)
    return tx


def register_or_login(email, password, role, full_name, referral_code=None):
    try:
        return call("POST", f"{AUTH}/api/auth/register", {
            "email": email, "password": password, "role": role, "fullName": full_name, "referralCode": referral_code,
        })
    except ApiError as e:
        if e.status != 409:
            raise
        return call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": password})


def multipart_file(field, filename, content, mime="application/pdf", fields=None):
    """Body multipart/form-data gồm 1 file và (tuỳ chọn) các trường văn bản `fields` {tên: giá trị}."""
    boundary = uuid.uuid4().hex
    body = b"".join(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        for name, value in (fields or {}).items())
    body += (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def make_pdf(lines):
    """Sinh file PDF 1 trang tối giản (font Helvetica, chỉ ký tự Latin) — dùng cho CV mẫu."""
    def esc(s):
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    stream = "BT /F1 11 Tf 50 790 Td 15 TL\n" + "".join(f"({esc(l)}) '\n" for l in lines) + "ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


SAMPLE_CV_LINES = [
    "TRAN MINH KHOA",
    "Junior Backend Developer",
    "Email: khoa.tran@example.com",
    "",
    "WORK EXPERIENCE",
    "FinTech Startup - Backend Intern (06/2024 - 06/2025)",
    "- Built REST API endpoints with Spring Boot and PostgreSQL",
    "- Wrote unit tests with JUnit, containerized services with Docker",
    "",
    "PROJECTS",
    "Movie Ticket Booking System",
    "- Java, Spring Boot, MySQL, Redis cache for seat availability",
    "Personal Blog",
    "- React frontend, Node.js backend, deployed with GitHub Actions",
    "",
    "EDUCATION",
    "Posts and Telecommunications Institute of Technology - Software Engineering",
    "",
    "SKILLS",
    "Java, Spring Boot, SQL, Git, Docker, JavaScript",
]


STRONG_VOICE_ANSWER = ("Toi dung Redis cache-aside voi TTL, invalidation khi ghi; trade-off consistency va hieu nang; index, "
                       "transaction, REST API versioning, pagination, idempotent. Vi du cu the o production.")


def voice_transcript(topics, answer=STRONG_VOICE_ANSWER):
    """Bản ghi như trình duyệt gửi: mỗi chủ đề = marker begin_topic + câu hỏi + câu trả lời (bỏ trống nếu answer rỗng)."""
    items = [{"role": "assistant", "text": "Xin chào, chúng ta bắt đầu buổi phỏng vấn nhé."}]
    for n in range(1, topics + 1):
        items += [{"role": "marker", "topicNo": n}, {"role": "assistant", "text": f"Câu hỏi chủ đề {n}?"}]
        if answer:
            items.append({"role": "user", "text": answer})
    return {"items": items}


def start_voice_interview(token, ack=True, consent=True, video=True):
    """FR-7.7 — POST /api/ai/interviews/voice. Không có OPENAI_API_KEY (ngoài prod) thì `voice` = null."""
    return call("POST", f"{AI}/api/ai/interviews/voice",
                {"selfAnswerAcknowledged": ack, "consentExternalAi": consent, "consentVideo": video}, token=token)


def upload_video_chunks(token, interview_id, starts_ms=(0, 10_000), dur_ms=10_000):
    """Tải các đoạn video + âm thanh giả lập như trình duyệt (mỗi đoạn `dur_ms` bắt đầu tại các mốc `starts_ms`)."""
    for n, start in enumerate(starts_ms):
        for kind in ("chunks", "audio-chunks"):
            call("PUT", f"{AI}/api/ai/verification/videos/{interview_id}/{kind}/{n}?startMs={start}&durMs={dur_ms}",
                 token=token, raw_body=b"webm-chunk-%d" % n, content_type="video/webm")


def finish_video(token, interview_id):
    return call("POST", f"{AI}/api/ai/verification/videos/{interview_id}/finish", token=token)


def complete_voice_interview(token, answer=STRONG_VOICE_ANSWER, starts_ms=(0, 10_000)):
    """Mentor bắt đầu buổi giọng nói, nộp bản chép lời giả lập và tải + chốt video => đợt ROUND1_REVIEW (chờ admin)."""
    interview = start_voice_interview(token)["interview"]
    done = call("POST", f"{AI}/api/ai/interviews/{interview['id']}/voice-transcript",
                voice_transcript(interview["maxTurns"], answer), token=token)
    upload_video_chunks(token, interview["id"], starts_ms)
    finish_video(token, interview["id"])
    return call("GET", f"{AI}/api/ai/interviews/{interview['id']}", token=token) or done


def round1_review(admin_token, interview, decision, note=None):
    """Admin duyệt vòng 1 của đợt chứa buổi `interview`: decision = PASS | REJECT | RETAKE."""
    return call("POST", f"{AI}/api/ai/admin/verification/applications/{interview['applicationId']}/round1-review",
                {"decision": decision, "note": note}, token=admin_token)


GOOD_ROUND2_SCORES = {"technical": 8, "depth": 7, "communication": 7, "mentoring": 7, "authenticity": 8}


def propose_slots(admin_token, application_id, days=3, count=2):
    """Admin đề xuất `count` khung giờ vòng 2 bắt đầu từ `days` ngày tới (mỗi khung cách nhau 1 giờ)."""
    from datetime import datetime, timedelta, timezone
    base = datetime.now(timezone.utc) + timedelta(days=days)
    return call("POST", f"{AI}/api/ai/admin/verification/applications/{application_id}/slots",
                {"startsAt": [(base + timedelta(hours=i)).isoformat() for i in range(count)]}, token=admin_token)


def choose_first_slot(mentor_token):
    slots = call("GET", f"{AI}/api/ai/verification/status", token=mentor_token)["slots"]
    return call("POST", f"{AI}/api/ai/verification/slots/{slots[0]['id']}/choose", token=mentor_token)


def round2_decision(admin_token, application_id, decision, scores=None, note=None, score_notes=None):
    return call("POST", f"{AI}/api/ai/admin/verification/applications/{application_id}/decision",
                {"decision": decision, "scores": scores, "scoreNotes": score_notes, "note": note}, token=admin_token)


def approve_mentor(admin_token, mentor_token, interview, note="Duyet cho e2e: mentor thu nghiem"):
    """Đưa mentor qua cả hai vòng: PASS vòng 1 → admin đề xuất giờ → mentor chọn → admin chấm phiếu và APPROVE (mentor APPROVED)."""
    round1_review(admin_token, interview, "PASS", note)
    propose_slots(admin_token, interview["applicationId"])
    choose_first_slot(mentor_token)
    return round2_decision(admin_token, interview["applicationId"], "APPROVE", GOOD_ROUND2_SCORES, note)
