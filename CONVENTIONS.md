# CONVENTIONS — Mentor-Mentee Learning Platform

## 1. Service ownership

| Người phụ trách | Backend services | Frontend feature folders |
|---|---|---|
| Phạm Ngọc Quang (A) | `auth-service` (8081), `learning-service` (8085) | `frontend/src/features/auth`, `frontend/src/features/learning` |
| Phạm Ninh Phương Thảo (B) | `profile-service` (8082), `matching-service` (8090) | `frontend/src/features/profile`, `frontend/src/features/matching` |
| Đinh Quyết Thắng (C) | `mentoring-service` (8083), `payment-service` (8084) | `frontend/src/features/mentoring`, `frontend/src/features/payment` |

Quy tắc: **không sửa code trong service không thuộc quyền sở hữu của mình**
mà không thông báo/xin review từ người phụ trách. Mọi thay đổi contract
(xem mục 3) phải được cả 2 bên liên quan đồng ý trước khi merge.

## 2. Git workflow

- **Trunk-based development**: nhánh `main` luôn deployable. Làm việc trên
  nhánh ngắn hạn `feature/<service>-<mo-ta-ngan>`, ví dụ
  `feature/matching-topk-retrieval`.
- **Squash merge** khi merge vào `main` — mỗi PR gộp thành 1 commit.
- Commit message theo Conventional Commits:
  `feat(matching): add top-k retrieval endpoint`,
  `fix(profile): correct embedding save on update`.
- **Daily async standup**: mỗi người ghi ngắn gọn (3 dòng: hôm qua làm gì /
  hôm nay làm gì / đang vướng gì) vào kênh chung.
- **Saturday full-system build**: bắt buộc mỗi thứ 7, chạy
  `docker compose up --build` toàn bộ hệ thống, xác nhận health check của
  cả 6 service đều pass trước khi coi tuần đó là "xong".

## 3. Contract-first API design

- Mọi endpoint giữa các service (kể cả frontend gọi backend) phải được
  định nghĩa trong `contracts/<service-name>.yaml` (OpenAPI 3.0) **trước
  khi code**.
- Thay đổi request/response schema = thay đổi contract trước, code sau.
  Không tự ý đổi field trong response mà không cập nhật file contract
  tương ứng.
- Naming: `camelCase` cho JSON field, `snake_case` cho tên bảng/cột SQL.
- Mọi response lỗi theo format thống nhất:
  ```json
  { "error": { "code": "STRING_CODE", "message": "human readable" } }
  ```

## 4. Cấu trúc thư mục mỗi service (Java/Spring Boot)

```
service-name/
  src/main/java/com/mmp/<service>/
    controller/
    service/
    repository/
    dto/
    config/
    <Service>Application.java
  src/main/resources/application.yml
  src/test/java/...
  Dockerfile
  pom.xml
```

## 5. Cấu trúc thư mục matching-service (Python/FastAPI)

```
matching-service/
  app/
    main.py
    routers/
    services/
    schemas/
    db.py
  requirements.txt
  Dockerfile
```

## 6. Database

- **1 database riêng cho mỗi service** — không service nào được ghi trực
  tiếp vào DB của service khác.
- **Ngoại lệ đã được duyệt**: `matching-service` được phép **đọc (READ-ONLY)**
  trực tiếp bảng `mentor_profiles` / `mentee_profiles` (cột `embedding`)
  trong DB của `profile-service`, để tránh truyền vector lớn qua HTTP.
  Mọi thao tác WRITE vào 2 bảng này chỉ do `profile-service` thực hiện.
  Bất kỳ ngoại lệ cross-service khác đều phải được cả nhóm thống nhất và
  ghi chú lại tại đây trước khi code.
- Migration SQL nằm trong `db/init/<service-name>.sql`, chạy tự động khi
  `docker compose up` lần đầu.

## 7. Environment & ports

| Service | Port | DB port (Postgres) |
|---|---|---|
| auth-service | 8081 | 5433 |
| profile-service | 8082 | 5434 |
| mentoring-service | 8083 | 5435 |
| payment-service | 8084 | 5436 |
| learning-service | 8085 | 5437 |
| matching-service | 8090 | (đọc chung DB 5434 của profile-service) |
| frontend (Next.js) | 3000 | — |
| Redis | 6379 | — |

## 8. Scope đã chốt (không mở rộng nếu chưa thống nhất nhóm)

- Trong scope: Auth, Career Profile, Learning Hub, AI Matching
  (embedding + pgvector), Mentoring workflow, Payment + Referral.
- Đã cắt khỏi scope: Chatbot độc lập (chỉ giữ lại dạng "chatbot enrichment"
  hẹp, phục vụ riêng cho AI Matching — xem `contracts/profile-service.yaml`
  phần `/mentee/enrichment-chat`), WebRTC.
- AI Interview (verify năng lực mentor) do Quang phụ trách, nằm trong
  `auth-service` hoặc `learning-service` tùy thiết kế chi tiết sau.
- CV Parsing + Chatbot enrichment do Thắng phụ trách, logic đặt trong
  `mentoring-service`, gọi API sang `profile-service` để đọc/ghi profile.
