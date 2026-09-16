"""Tiện ích dùng chung cho script seed/e2e — chỉ dùng thư viện chuẩn Python."""
import json
import os
import urllib.error
import urllib.request
import uuid

AUTH = os.getenv("AUTH_URL", "http://localhost:8081")
PROFILE = os.getenv("PROFILE_URL", "http://localhost:8082")
MENTORING = os.getenv("MENTORING_URL", "http://localhost:8083")
PAYMENT = os.getenv("PAYMENT_URL", "http://localhost:8084")
LEARNING = os.getenv("LEARNING_URL", "http://localhost:8085")
MATCHING = os.getenv("MATCHING_URL", "http://localhost:8090")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key")


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


def call(method, url, body=None, token=None, internal=False, raw_body=None, content_type=None):
    headers = {"Accept": "application/json"}
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
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = text
        raise ApiError(e.code, parsed) from None


def register_or_login(email, password, role, full_name, referral_code=None):
    try:
        return call("POST", f"{AUTH}/api/auth/register", {
            "email": email, "password": password, "role": role, "fullName": full_name, "referralCode": referral_code,
        })
    except ApiError as e:
        if e.status != 409:
            raise
        return call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": password})


def multipart_file(field, filename, content, mime="application/pdf"):
    boundary = uuid.uuid4().hex
    body = (
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
