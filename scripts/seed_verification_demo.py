#!/usr/bin/env python3
"""
Dữ liệu demo cho màn hình xác thực mentor (phỏng vấn AI trực tiếp). Mật khẩu mọi tài khoản: Demo@123.

    python3 scripts/seed_verification_demo.py

  verify.ready@demo.local     có lượt backend ở trạng thái READY            -> /interview: bắt đầu phỏng vấn
  verify.progress@demo.local  đang phỏng vấn dở (đã trả lời 2/5 chủ đề)      -> /interview: tiếp tục
  verify.unclear@demo.local   nộp bài, kết quả chưa rõ ràng, chờ admin       -> admin (admin@mmp.local / Admin@123) tại /admin/verification
  verify.passed@demo.local    được admin duyệt, lĩnh vực đã xác thực
  verify.failed@demo.local    admin từ chối, đang chờ ngày được phỏng vấn lại
Video giả lập chỉ là byte vô nghĩa nên trình phát không hiển thị hình.
"""
import sys

from common import AI, AUTH, PROFILE, ApiError, call, multipart_file

PASSWORD = "Demo@123"
STRONG = ("Mình dùng cache-aside với Redis, đặt TTL và xoá cache khi ghi; đánh đổi giữa nhất quán và hiệu năng. "
          "Ví dụ trong dự án production của công ty, mình đo benchmark giảm 40% độ trễ, thêm index, dùng transaction, "
          "versioning REST API, phân trang và idempotent. Mình hướng dẫn junior bằng bài tập và code review.")


def mentor(email, name):
    try:
        m = call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": PASSWORD})
    except ApiError:
        m = call("POST", f"{AUTH}/api/auth/register", {"email": email, "password": PASSWORD, "role": "MENTOR", "fullName": name})
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": name, "domain": "backend", "skills": ["Java", "Spring Boot", "Redis"],
        "bio": "Backend engineer 6 năm kinh nghiệm, hướng dẫn junior xây dựng REST API và microservices.",
        "yearsExperience": 6, "hourlyRate": 200000, "capacity": 5, "isAvailable": True, "portfolioLinks": []}, token=m["accessToken"])
    return m


def start(token):
    status = call("GET", f"{AI}/api/ai/verification/status", token=token)
    track = next(t for t in status["tracks"] if t["domain"] == "backend")
    return track, status


def answer(token, interview, transcript, count=None):
    done = 0
    while interview["question"] and (count is None or done < count):
        body, ctype = multipart_file("media", "a.webm", b"fake-webm", "video/webm", {
            "questionId": interview["question"]["id"], "transcript": transcript, "durationSeconds": "45"})
        interview = call("POST", f"{AI}/api/ai/verification/interviews/{interview['id']}/answers", token=token,
                         raw_body=body, content_type=ctype)
        done += 1
    return interview


def main():
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    for email, name, target in [
        ("verify.ready@demo.local", "Demo Sẵn Sàng Phỏng Vấn", "READY"),
        ("verify.progress@demo.local", "Demo Đang Phỏng Vấn Dở", "IN_PROGRESS"),
        ("verify.unclear@demo.local", "Demo Chờ Admin Duyệt", "PENDING_REVIEW"),
        ("verify.passed@demo.local", "Demo Đã Xác Thực", "PASSED"),
        ("verify.failed@demo.local", "Demo Bị Từ Chối", "FAILED"),
    ]:
        m = mentor(email, name)
        token = m["accessToken"]
        track, _ = start(token)
        if track["stage"] != "READY":
            print(f"  {email:34} đã ở {track['stage']} — giữ nguyên")
            continue
        if target == "READY":
            print(f"  {email:34} READY")
            continue
        iv = call("POST", f"{AI}/api/ai/verification/interviews", {"trackId": track["id"], "consent": True}, token=token)
        if target == "IN_PROGRESS":
            answer(token, iv, STRONG, count=2)
            print(f"  {email:34} IN_PROGRESS (2/5)")
            continue
        answer(token, iv, "" if target != "PASSED" else STRONG)
        result = call("POST", f"{AI}/api/ai/verification/interviews/{iv['id']}/submit", token=token)
        if target in ("PASSED", "FAILED") and result["outcome"] == "UNCLEAR":
            decision = {"decision": "APPROVE" if target == "PASSED" else "REJECT",
                        "note": "Đã nghe video, đạt yêu cầu." if target == "PASSED" else "Thiếu ví dụ thực tế ở nhiều chủ đề.",
                        "reviewedVideo": True}
            call("POST", f"{AI}/api/ai/admin/verification/{result['id']}/decision", decision, token=admin)
        print(f"  {email:34} {target} (kết quả AI: {result['outcome']})")


if __name__ == "__main__":
    try:
        main()
    except ApiError as e:
        print("Seed failed:", e, file=sys.stderr)
        sys.exit(1)
