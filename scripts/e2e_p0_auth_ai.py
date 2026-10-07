#!/usr/bin/env python3
"""
Kiểm thử e2e cho backlog P0 của auth-service / ai-service (Sprint 1: US-09 quên mật khẩu).

Chạy trên hệ thống đang chạy (docker compose up), auth-service KHÔNG ở profile prod (cần hộp thư dev
GET /internal/dev/emails để đọc link đặt lại mật khẩu):

    python3 scripts/e2e_p0_auth_ai.py          # AUTH_URL, INTERNAL_API_KEY đọc từ biến môi trường (common.py)
"""
import re
import sys
import urllib.parse
import uuid

from common import AUTH, ApiError, call

RUN = uuid.uuid4().hex[:6]
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))


def error_code(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error") or {}).get("code") if isinstance(e.body, dict) else None
    return None, None


def outbox(email):
    return call("GET", f"{AUTH}/internal/dev/emails?to={urllib.parse.quote(email)}", internal=True)


def reset_links(email):
    return [m for m in outbox(email) if "/reset-password?token=" in m["body"]]


def main():
    print(f"E2E P0 auth/ai run {RUN}\n\nUS-09 — Quên / đặt lại mật khẩu")
    email = f"e2e.reset.{RUN}@test.local"
    user = call("POST", f"{AUTH}/api/auth/register",
                {"email": email, "password": "Passw0rd!", "role": "MENTEE", "fullName": "E2E Reset"})

    check("Email không tồn tại vẫn 202 (không dò được email)",
          call("POST", f"{AUTH}/api/auth/forgot-password", {"email": f"ghost.{RUN}@test.local"}) is None
          and outbox(f"ghost.{RUN}@test.local") == [])
    call("POST", f"{AUTH}/api/auth/forgot-password", {"email": email.upper()})
    links = reset_links(email)
    check("Email tồn tại: 202 và có link /reset-password", len(links) == 1, links)
    token = re.search(r"token=([A-Za-z0-9_-]+)", links[0]["body"]).group(1)

    check("Hộp thư dev chỉ cho service nội bộ", error_code(lambda: call(
        "GET", f"{AUTH}/internal/dev/emails?to={urllib.parse.quote(email)}"))[0] in (401, 403))
    check("Mật khẩu mới sai quy tắc đăng ký → 400", error_code(lambda: call(
        "POST", f"{AUTH}/api/auth/reset-password", {"token": token, "newPassword": "short"})) == (400, "VALIDATION_ERROR"))
    check("Token sai → 400 RESET_TOKEN_INVALID", error_code(lambda: call(
        "POST", f"{AUTH}/api/auth/reset-password", {"token": "khong-ton-tai", "newPassword": "NewPassw0rd!"}))
          == (400, "RESET_TOKEN_INVALID"))

    call("POST", f"{AUTH}/api/auth/reset-password", {"token": token, "newPassword": "NewPassw0rd!"})
    check("Dùng lại token → 400 RESET_TOKEN_INVALID (một lần)", error_code(lambda: call(
        "POST", f"{AUTH}/api/auth/reset-password", {"token": token, "newPassword": "Another1!"}))
          == (400, "RESET_TOKEN_INVALID"))
    check("Mọi refresh token cũ bị thu hồi", error_code(lambda: call(
        "POST", f"{AUTH}/api/auth/refresh", {"refreshToken": user["refreshToken"]}))[0] == 401)
    check("Mật khẩu cũ không đăng nhập được", error_code(lambda: call(
        "POST", f"{AUTH}/api/auth/login", {"email": email, "password": "Passw0rd!"}))[0] == 401)
    check("Mật khẩu mới đăng nhập được",
          call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": "NewPassw0rd!"})["userId"] == user["userId"])

    # Đã dùng 1 yêu cầu ở trên; thêm 4 yêu cầu nữa → chỉ 2 email mới (tổng 3/giờ), các yêu cầu sau vẫn 202
    responses = [call("POST", f"{AUTH}/api/auth/forgot-password", {"email": email}) for _ in range(4)]
    check("Tối đa 3 yêu cầu / email / giờ, vượt quá vẫn 202",
          all(r is None for r in responses) and len(reset_links(email)) == 3, len(reset_links(email)))
    newest, older = reset_links(email)[0], reset_links(email)[1]
    old_token = re.search(r"token=([A-Za-z0-9_-]+)", older["body"]).group(1)
    check("Yêu cầu mới làm link cũ hết hiệu lực", error_code(lambda: call(
        "POST", f"{AUTH}/api/auth/reset-password", {"token": old_token, "newPassword": "Another1!"}))
          == (400, "RESET_TOKEN_INVALID"))
    new_token = re.search(r"token=([A-Za-z0-9_-]+)", newest["body"]).group(1)
    check("Link mới nhất vẫn dùng được",
          call("POST", f"{AUTH}/api/auth/reset-password", {"token": new_token, "newPassword": "Another1!"}) is None)

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
