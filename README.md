# MentorHub — Mentor-Mentee Learning Platform

Đồ án tốt nghiệp — nền tảng học tập và kết nối mentor-mentee trong lĩnh vực lập trình, kiến trúc
microservices với 3 tính năng AI: **AI Matching** (embedding + pgvector), **AI Interview** xác thực
mentor, **CV Parsing + Chatbot enrichment** làm rõ mục tiêu mentee (DeepSeek API hoặc engine rule-based chạy offline).

| | |
|---|---|
| Nhóm | Phạm Ngọc Quang · Đinh Quyết Thắng · Phạm Ninh Phương Thảo (E22CNPM03) |
| GVHD | Đào Ngọc Phong |
| Tài liệu | [`docs/`](docs/README.md) — SRD, kiến trúc, CSDL, API, AI, kiểm thử, triển khai, hướng dẫn sử dụng |

## Chạy nhanh

```bash
cp .env.example .env               # tuỳ chọn: điền DEEPSEEK_API_KEY để dùng DeepSeek cho AI Interview / CV
docker compose up -d --build       # lần đầu 5–15 phút
python3 scripts/seed_demo.py       # dữ liệu demo (mật khẩu Demo@123, admin: admin@mmp.local / Admin@123)
```

Mở <http://localhost:3000>. Health check từng service:

```bash
for p in 8081 8082 8083 8084 8085 8090 8091; do curl -s localhost:$p/health; echo; done
```

Kiểm thử:

```bash
python3 scripts/e2e_acceptance.py          # 65 kiểm tra theo Definition of Done
python3 scripts/benchmark_matching.py      # hiệu năng AI Matching
(cd mentoring-service && mvn test)         # unit test (tương tự các service Java khác)
(cd matching-service && pip install -r requirements-dev.txt && pytest -q tests)
(cd ai-service && pip install -r requirements-dev.txt && pytest -q tests)
```

Chi tiết: [docs/deployment-guide.md](docs/deployment-guide.md).

## Kiến trúc

```
browser → frontend (Next.js :3000, proxy /api/<service>/**)
            ├─ auth-service       Spring Boot :8081  — tài khoản, JWT, RBAC                (Quang)
            ├─ learning-service   Spring Boot :8085  — khoá học, roadmap, tiến độ          (Quang)
            ├─ profile-service    Spring Boot :8082  — hồ sơ, lịch rảnh, embedding         (Thảo)
            ├─ matching-service   FastAPI     :8090  — AI Matching                         (Thảo)
            ├─ mentoring-service  Spring Boot :8083  — yêu cầu, lịch, đánh giá; lưu dữ liệu AI  (Thắng)
            │     └─ ai-service   FastAPI     :8091  — AI Interview (Thắng), CV + chatbot (Quang)
            │                                          DeepSeek API + engine rule-based
            └─ payment-service    Spring Boot :8084  — thanh toán sandbox, referral        (Thắng)
PostgreSQL 16 (1 DB/service, pgvector cho profile) · Redis · Docker Compose · GitHub Actions
```

## Cấu trúc repo

```
CONVENTIONS.md            quy ước chung — đọc trước khi code
docker-compose.yml        toàn bộ hệ thống
.env.example              biến môi trường
contracts/                OpenAPI contract từng service (contract-first)
db/init/                  schema SQL + dữ liệu seed Learning Hub
docs/                     tài liệu đồ án
scripts/                  seed_demo.py, e2e_acceptance.py, benchmark_matching.py, make_sample_cv.py
auth-service/ learning-service/ profile-service/ mentoring-service/ payment-service/   Java 21, Spring Boot 3.3
matching-service/         Python 3.11, FastAPI, sentence-transformers
ai-service/               Python 3.11, FastAPI, DeepSeek (httpx), pypdf
frontend/                 Next.js 14 (src/app = trang, src/features/<owner-folder> = API client)
```
