# Mentor-Mentee Learning Platform

Đồ án tốt nghiệp — nền tảng học tập kết nối mentor-mentee trong lĩnh vực
lập trình. Kiến trúc microservices, 6 service, mỗi thành viên sở hữu 2
service (xem `CONVENTIONS.md` mục 1).

## Chạy thử toàn hệ thống

```bash
docker compose up --build
```

Sau khi lên, kiểm tra health check từng service:

```bash
curl http://localhost:8081/health   # auth-service
curl http://localhost:8082/health   # profile-service
curl http://localhost:8083/health   # mentoring-service
curl http://localhost:8084/health   # payment-service
curl http://localhost:8085/health   # learning-service
curl http://localhost:8090/health   # matching-service
```

Frontend chạy tại http://localhost:3000

## Cấu trúc repo

```
mentor-mentee-platform/
  CONVENTIONS.md          # quy ước chung — đọc trước khi code
  docker-compose.yml
  contracts/               # OpenAPI contract giữa các service — contract-first
  db/init/                 # migration SQL, chạy tự động lần đầu docker compose up
  auth-service/            # Java Spring Boot — Quang
  learning-service/        # Java Spring Boot — Quang
  profile-service/         # Java Spring Boot — Thảo
  matching-service/        # Python FastAPI  — Thảo
  mentoring-service/       # Java Spring Boot — Thắng
  payment-service/         # Java Spring Boot — Thắng
  frontend/                # Next.js 14, feature-folder theo ownership
```

## Đọc thêm

- `CONVENTIONS.md` — quy ước git, ownership, database, API contract.
- `contracts/*.yaml` — OpenAPI spec từng service, đọc trước khi code
  bất kỳ endpoint mới nào.
- Xem thêm SRD đầy đủ trong tài liệu riêng của nhóm (không đính kèm ở
  skeleton này).
