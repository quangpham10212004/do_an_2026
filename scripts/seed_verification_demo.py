#!/usr/bin/env python3
"""
Dữ liệu demo cho màn hình xác thực mentor (không cần OPENAI_API_KEY): tạo mentor ở từng bước của quy trình 2 vòng để xem/kiểm giao diện.

    python3 scripts/seed_verification_demo.py

Mật khẩu mọi tài khoản: Demo@123. Đăng nhập admin (admin@mmp.local / Admin@123) tại /admin/verification:
  verify.r1review@demo.local   vòng 1 xong (có video giả lập), chờ admin duyệt        → thử PASS / REJECT / RETAKE
  verify.slots@demo.local      đã qua vòng 1, chờ admin đề xuất khung giờ             → thử đề xuất giờ
  verify.choice@demo.local     đã có khung giờ, chờ mentor chọn                      → đăng nhập mentor để chọn giờ
  verify.scheduled@demo.local  đã chốt giờ vòng 2 (phòng mở trong 5 phút)            → thử vào phòng + chấm phiếu
Video giả lập chỉ là byte vô nghĩa nên trình phát sẽ không hiển thị hình; luồng quay thật cần camera + OpenAI.
Cần ai-service chạy với endpoint dev (không có ở APP_ENV=prod) và INTERNAL_API_KEY đúng.
"""
import sys

from common import (AI, AUTH, PROFILE, ApiError, call, choose_first_slot, complete_voice_interview, propose_slots,
                    round1_review)

PASSWORD = "Demo@123"


def mentor(email, name):
    try:
        m = call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": PASSWORD})
    except ApiError:
        m = call("POST", f"{AUTH}/api/auth/register", {"email": email, "password": PASSWORD, "role": "MENTOR", "fullName": name})
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": name, "domain": "backend", "skills": ["Java", "Spring Boot", "Redis"],
        "bio": "Backend engineer 6 nam kinh nghiem, huong dan junior xay dung REST API va microservices.",
        "yearsExperience": 6, "hourlyRate": 200000, "capacity": 5, "isAvailable": True, "portfolioLinks": []}, token=m["accessToken"])
    return m


def status(m):
    return call("GET", f"{AI}/api/ai/verification/status", token=m["accessToken"])


def main():
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    steps = [
        ("verify.r1review@demo.local", "Demo Vòng1 Chờ Duyệt", "ROUND1_REVIEW"),
        ("verify.slots@demo.local", "Demo Chờ Đề Xuất Giờ", "ROUND2_PENDING_SLOTS"),
        ("verify.choice@demo.local", "Demo Chờ Chọn Giờ", "ROUND2_PENDING_CHOICE"),
        ("verify.scheduled@demo.local", "Demo Đã Chốt Giờ", "ROUND2_SCHEDULED"),
    ]
    for email, name, target in steps:
        m = mentor(email, name)
        current = status(m)["status"]
        if current is not None and current not in ("ROUND1", "CLOSED", "REJECTED"):
            print(f"  {email:34} đã ở {current} — giữ nguyên")
            continue
        if current in ("CLOSED", "REJECTED") and not status(m)["canStart"]:
            print(f"  {email:34} đang trong thời gian chờ sau khi bị đóng đợt — bỏ qua")
            continue
        iv = complete_voice_interview(m["accessToken"])
        if target != "ROUND1_REVIEW":
            round1_review(admin, iv, "PASS", "Dat vong 1 (demo)")
        if target in ("ROUND2_PENDING_CHOICE", "ROUND2_SCHEDULED"):
            propose_slots(admin, iv["applicationId"], days=3, count=3)
        if target == "ROUND2_SCHEDULED":
            choose_first_slot(m["accessToken"])
            call("POST", f"{AI}/internal/dev/verification/{iv['applicationId']}/move-interview?minutes=5", internal=True)
        print(f"  {email:34} → {status(m)['status']}")
    print(f"\nXong. Mật khẩu mọi tài khoản demo: {PASSWORD}. Admin: admin@mmp.local / Admin@123 → /admin/verification")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
