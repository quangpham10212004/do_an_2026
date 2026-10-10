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


_AI_START = re.compile(r"/api/ai/interviews/?$")
_AI_REVIEW = re.compile(r"/api/ai/admin/interviews/[^/]+/review/?$")
MIN_OVERRULE_NOTE = 10


_LOGIN = re.compile(r"/api/auth/login/?$")
_SESSION_REVIEW = re.compile(r"/api/mentoring/sessions/[^/]+/review/?$")


_AI_ANSWER = re.compile(r"/api/ai/interviews/[^/]+/answers/?$")
AI_ANSWER_MIN = 50


def _answer_compat(method, url, body):
    """
    Tương thích US-43 (Sprint 5): câu trả lời AI Interview cần 50–3000 ký tự. Script cũ cố tình trả lời rất ngắn
    ("Khong biet...") để có buổi bị đánh giá thấp → lặp lại chính câu đó cho đủ 50 ký tự (nội dung vẫn yếu).
    """
    if method == "POST" and isinstance(body, dict) and _AI_ANSWER.search(url):
        text = (body.get("answer") or "").strip()
        if 0 < len(text) < AI_ANSWER_MIN:
            padded = text
            while len(padded) < AI_ANSWER_MIN:
                padded += " " + text
            return {**body, "answer": padded}
    return body


def _review_compat(method, url, body):
    """
    Tương thích US-41 (Sprint 5): đánh giá mới bắt buộc 3 điểm thành phần (kiến thức, truyền đạt, chuẩn bị). Script
    cũ chỉ gửi {rating, comment} được bổ sung điểm thành phần = rating. Script kiểm tra US-41 luôn gửi đủ.
    """
    if method == "POST" and isinstance(body, dict) and _SESSION_REVIEW.search(url) and "knowledge" not in body:
        r = body.get("rating")
        return {**body, "knowledge": r, "clarity": r, "preparation": r}
    return body


def _ai_interview_compat(method, url, body):
    """
    Tương thích cho các script seed/e2e dựng mentor đã duyệt (Sprint 3, Team C):
    - US-22: POST /api/ai/interviews bắt buộc {"selfAnswerAcknowledged": true} — script không gửi body thì tự thêm.
    - US-23: admin APPROVE ngược khuyến nghị AI cần ghi chú >= 10 ký tự — các script "duyệt cho đủ điều kiện" với
      note ngắn ("ok") được bổ sung ghi chú. Script kiểm tra chính các quy tắc này (e2e_s3_ai_auth.py) luôn gửi body
      đầy đủ nên không bị ảnh hưởng.
    """
    if method != "POST":
        return body
    if body is None and _AI_START.search(url):
        return {"selfAnswerAcknowledged": True}
    if (isinstance(body, dict) and _AI_REVIEW.search(url) and body.get("decision") == "APPROVE"
            and len((body.get("note") or "").strip()) < MIN_OVERRULE_NOTE):
        return {**body, "note": ((body.get("note") or "").strip() + " (e2e: admin duyệt mentor thử nghiệm)").strip()}
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
    body = (_answer_compat(method, url, _review_compat(method, url, _ai_interview_compat(method, url, body)))
            if raw_body is None else body)
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
    """POST /api/payment/charge — US-13 bắt buộc header Idempotency-Key (mặc định sinh UUID mới cho mỗi lần gọi)."""
    body = {"sessionId": session_id, "card": card}
    if amount is not None:
        body["amount"] = amount
    return call("POST", f"{PAYMENT}/api/payment/charge", body, token=token,
                headers={"Idempotency-Key": idempotency_key or str(uuid.uuid4())})


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
