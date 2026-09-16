#!/usr/bin/env python3
"""
Seed dữ liệu demo: mentor mẫu (hồ sơ + lịch rảnh + embedding) và mentee mẫu.

Chạy sau khi `docker compose up` đã sẵn sàng:
    python3 scripts/seed_demo.py

Ghi chú: để có sẵn mentor xuất hiện trong kết quả matching, script duyệt nhanh
mentor bằng endpoint nội bộ của profile-service (bỏ qua AI Interview). Đây là
lối tắt CHỈ dành cho dữ liệu demo — luồng thật là mentor phỏng vấn trong UI và
admin duyệt. Mentor cuối danh sách được để ở trạng thái chưa phỏng vấn để minh
hoạ việc bị loại khỏi kết quả matching.
"""
import sys

from common import AUTH, PROFILE, ApiError, call, register_or_login

PASSWORD = "Demo@123"

MENTORS = [
    ("mentor.java@demo.local", "Nguyễn Hoàng Long", "backend", ["Java", "Spring Boot", "PostgreSQL", "Microservices", "System Design", "Kafka"], 9,
     "Senior backend engineer 9 năm kinh nghiệm xây dựng hệ thống thanh toán quy mô lớn. Thích hướng dẫn system design và luyện phỏng vấn backend.", 300000, 4,
     [(1, "19:00", "22:00"), (3, "19:00", "22:00"), (6, "08:00", "12:00")], True),
    ("mentor.node@demo.local", "Trần Thu Hà", "backend", ["Node.js", "TypeScript", "MongoDB", "REST API", "Docker"], 5,
     "Backend developer chuyên Node.js và TypeScript, từng làm startup thương mại điện tử. Hỗ trợ người mới xây dựng API và triển khai Docker.", 150000, 3,
     [(2, "20:00", "22:00"), (4, "20:00", "22:00"), (7, "09:00", "11:00")], True),
    ("mentor.python@demo.local", "Lê Quốc Bảo", "backend", ["Python", "Django", "FastAPI", "PostgreSQL", "Redis"], 6,
     "Kỹ sư Python backend, xây dựng API hiệu năng cao với FastAPI. Mentor về clean code, testing và tối ưu cơ sở dữ liệu.", 0, 5,
     [(1, "07:00", "09:00"), (5, "19:00", "21:00"), (6, "14:00", "18:00")], True),
    ("mentor.react@demo.local", "Phạm Minh Anh", "frontend", ["React", "Next.js", "TypeScript", "CSS", "Testing"], 7,
     "Frontend lead với 7 năm kinh nghiệm React/Next.js. Hướng dẫn xây dựng UI hiệu năng cao, accessibility và kiến trúc frontend.", 250000, 3,
     [(2, "19:00", "21:30"), (6, "09:00", "12:00")], True),
    ("mentor.devops@demo.local", "Đỗ Thành Nam", "devops", ["Docker", "Kubernetes", "AWS", "Terraform", "CI/CD", "Linux"], 8,
     "DevOps engineer vận hành hạ tầng Kubernetes cho hệ thống hàng triệu người dùng. Mentor về CI/CD, cloud và SRE.", 350000, 2,
     [(3, "20:00", "22:00"), (7, "14:00", "17:00")], True),
    ("mentor.data@demo.local", "Vũ Khánh Linh", "data", ["Python", "Machine Learning", "PyTorch", "NLP", "SQL"], 4,
     "Data scientist chuyên NLP và hệ gợi ý. Hướng dẫn quy trình ML từ dữ liệu tới triển khai mô hình.", 200000, 3,
     [(4, "19:00", "21:00"), (6, "13:00", "16:00")], True),
    ("mentor.full@demo.local", "Bùi Đức Thắng", "backend", ["Java", "Spring Boot", "Docker"], 3,
     "Backend developer 3 năm kinh nghiệm, mới đăng ký làm mentor (chưa hoàn thành AI Interview).", 100000, 2,
     [(1, "19:00", "21:00")], False),
]

MENTEES = [
    ("mentee@demo.local", "Trần Minh Khoa", "backend", "BEGINNER", ["Java", "SQL", "Git"],
     "Muốn trở thành backend developer Java, chuẩn bị phỏng vấn trong 6 tháng tới và học thêm system design."),
    ("mentee.frontend@demo.local", "Ngô Bảo Châu", "frontend", "INTERMEDIATE", ["HTML", "CSS", "JavaScript"],
     "Muốn nâng cao kỹ năng React và Next.js để ứng tuyển vị trí frontend developer."),
]


def main():
    print(f"Seeding demo data via {AUTH} / {PROFILE}")
    for email, name, domain, skills, years, bio, rate, capacity, slots, approve in MENTORS:
        auth = register_or_login(email, PASSWORD, "MENTOR", name)
        uid, token = auth["userId"], auth["accessToken"]
        call("PUT", f"{PROFILE}/api/profile/mentor/{uid}", {
            "displayName": name, "skills": skills, "domain": domain, "bio": bio, "yearsExperience": years,
            "hourlyRate": rate, "capacity": capacity, "isAvailable": True, "portfolioLinks": [],
        }, token=token)
        call("PUT", f"{PROFILE}/api/profile/mentor/{uid}/availability", {
            "slots": [{"dayOfWeek": d, "startTime": s, "endTime": e} for d, s, e in slots],
        }, token=token)
        if approve:
            call("PUT", f"{PROFILE}/internal/mentor/{uid}/verification", {"status": "APPROVED"}, internal=True)
        print(f"  mentor  {email:<28} {'APPROVED' if approve else 'PENDING_INTERVIEW'}")

    for email, name, domain, level, skills, goal in MENTEES:
        auth = register_or_login(email, PASSWORD, "MENTEE", name)
        call("PUT", f"{PROFILE}/api/profile/mentee/{auth['userId']}", {
            "displayName": name, "goal": goal, "domain": domain, "currentLevel": level, "skills": skills, "portfolioLinks": [],
        }, token=auth["accessToken"])
        print(f"  mentee  {email}")

    print(f"\nXong. Mật khẩu mọi tài khoản demo: {PASSWORD}. Admin: admin@mmp.local / Admin@123")


if __name__ == "__main__":
    try:
        main()
    except ApiError as e:
        print("Seed failed:", e, file=sys.stderr)
        sys.exit(1)
