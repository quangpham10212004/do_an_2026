# CONVENTIONS — Mentor-Mentee Learning Platform

## 1. Service ownership

| Người phụ trách | Backend services | Frontend feature folders | Tính năng AI tự bảo vệ |
|---|---|---|---|
| Phạm Ngọc Quang (A) | `auth-service` (8081), `learning-service` (8085), `ai-service/app/cv`, `ai-service/app/enrichment` | `frontend/src/features/auth`, `frontend/src/features/learning` | CV Parsing + Chatbot enrichment |
| Phạm Ninh Phương Thảo (B) | `profile-service` (8082), `matching-service` (8090) | `frontend/src/features/profile`, `frontend/src/features/matching` | AI Matching |
| Đinh Quyết Thắng (C) | `mentoring-service` (8083), `payment-service` (8084), `ai-service/app/interview` | `frontend/src/features/mentoring`, `frontend/src/features/payment` | AI Interview |

Quy tắc: **không sửa code trong service không thuộc quyền sở hữu của mình** mà không thông báo/xin
review từ người phụ trách. Mọi thay đổi contract (mục 3) phải được cả 2 bên liên quan đồng ý trước khi merge.

`ai-service` (8091, Python) có đồng sở hữu theo module: `app/interview/` (Thắng), `app/cv/` và
`app/enrichment/` (Quang); phần dùng chung (`app/llm/`, `app/engines.py`, `app/main.py`, `app/security.py`)
cần cả hai review. Luồng nghiệp vụ và dữ liệu của CV enrichment nằm ở `mentoring-service`
(`CvEnrichmentService`, `CvEnrichmentController`) — thay đổi cần Thắng review; `client/AiClient` là hợp
đồng giữa hai service, thay đổi phải cập nhật `contracts/ai-service.yaml` trước.

Trang giao diện (`frontend/src/app/**`) thuộc người sở hữu feature mà trang đó gọi API chính.

## 2. Git workflow

- **Trunk-based development**: nhánh `main` luôn deployable. Làm việc trên nhánh ngắn hạn
  `feature/<service>-<mo-ta-ngan>`, ví dụ `feature/matching-topk-retrieval`.
- **Squash merge** khi merge vào `main` — mỗi PR gộp thành 1 commit.
- Commit message theo Conventional Commits: `feat(matching): add top-k retrieval endpoint`,
  `fix(profile): correct embedding save on update`.
- PR chỉ được merge khi CI xanh (build + unit test + e2e).
- **Daily async standup**: 3 dòng (hôm qua / hôm nay / đang vướng) vào kênh chung.
- **Saturday full-system build**: mỗi thứ 7 chạy `docker compose up --build`, `scripts/seed_demo.py`,
  `scripts/e2e_acceptance.py`; tuần chỉ coi là "xong" khi e2e pass.

## 3. Contract-first API design

- Mọi endpoint (kể cả frontend gọi backend và giữa các service) phải được định nghĩa trong
  `contracts/<service-name>.yaml` (OpenAPI 3.0) **trước khi code**.
- Thay đổi request/response = cập nhật contract trước, code sau.
- Naming: `camelCase` cho JSON field, `snake_case` cho bảng/cột SQL. Python dùng Pydantic
  `alias_generator=to_camel` để trả JSON camelCase.
- Mọi response lỗi theo format thống nhất:
  ```json
  { "error": { "code": "STRING_CODE", "message": "human readable" } }
  ```
  Java: ném `ApiException` (được `GlobalExceptionHandler` chuyển đổi); Python: `HTTPException(detail={"code", "message"})`.
- Tiền tố đường dẫn:
  - `/api/<service>/**` — API cho frontend, yêu cầu JWT (trừ các endpoint công khai khai báo trong
    `app.security.public-paths`).
  - `/api/<service>/admin/**` — chỉ role `ADMIN`.
  - `/internal/**` — chỉ service nội bộ, xác thực bằng header `X-Internal-Token`; không bao giờ đi qua frontend.

## 4. Bảo mật & cấu hình

- JWT HS256 ký bằng `JWT_SECRET` dùng chung; claims: `sub` (userId), `email`, `role`, `typ=access`.
  Mỗi service tự xác minh token (package `security/` giống nhau ở các service Java; `app/security.py` ở
  matching-service). Không tự chọn thuật toán khác HS256.
- Kiểm tra quyền: role bằng `@PreAuthorize`; quyền sở hữu bằng `CurrentUser.requireAccess(ownerId)`.
- Không commit secret. Mọi cấu hình qua biến môi trường (`.env`, xem `.env.example`).
- Nội dung do người dùng nhập khi đưa vào prompt LLM phải được bọc trong thẻ (`<answer>`, `<cv>`) và
  system prompt phải yêu cầu coi đó là dữ liệu. `DEEPSEEK_API_KEY` chỉ cấu hình cho ai-service.

## 5. Cấu trúc thư mục mỗi service (Java/Spring Boot)

```
service-name/
  src/main/java/com/mmp/<service>/
    controller/     REST controller (public + Internal*Controller)
    service/        nghiệp vụ, transaction, job @Scheduled
    repository/     Spring Data JPA / JdbcTemplate
    entity/         JPA entity
    dto/            record request/response (jakarta.validation)
    client/         RestClient gọi service khác
    security/       JwtService, JwtAuthenticationFilter, SecurityConfig, CurrentUser, AuthUser
    exception/      ApiException, ErrorResponse, GlobalExceptionHandler
    config/         cấu hình, seeder
    <Service>Application.java
  src/main/resources/application.yml
  src/test/java/...
  Dockerfile
  pom.xml
```

Quy ước code: không gọi mạng bên trong transaction (dùng `TransactionTemplate` cho phần ghi DB); logic
nghiệp vụ thuần tách thành hàm/lớp không phụ thuộc I/O để unit test.

## 6. Cấu trúc thư mục service Python (matching-service, ai-service)

```
matching-service/
  app/
    main.py          app, lifespan (load model), exception handler
    config.py        biến môi trường
    security.py      xác minh JWT / internal token
    db.py            asyncpg pool (read-only)
    routers/         embed.py, matching.py
    services/        embedding_service.py, matching_pipeline.py
    schemas/         Pydantic model
  tests/
  requirements.txt  requirements-dev.txt  Dockerfile
```

ai-service tổ chức theo tính năng: `app/interview/`, `app/cv/`, `app/enrichment/` (mỗi thư mục có
`models.py`, `rule_based.py`, `deepseek_*.py`), `app/llm/deepseek.py`, `app/routers/`. ai-service
**không lưu trạng thái** và chỉ có endpoint `/internal/*`; engine LLM luôn phải có fallback rule-based.

## 7. Database

- **1 database riêng cho mỗi service** — không service nào ghi trực tiếp vào DB của service khác.
- **Ngoại lệ đã được duyệt**: `matching-service` được phép **đọc (READ-ONLY)** trực tiếp các bảng
  `mentor_profiles`, `mentee_profiles`, `mentor_availability` trong DB của `profile-service`, để tính
  khoảng cách vector ngay trong PostgreSQL thay vì truyền vector qua HTTP. Kết nối dùng role
  `matching_reader` chỉ có quyền `SELECT` (tạo trong `db/init/profile-service.sql`). Mọi thao tác WRITE
  vào các bảng này chỉ do `profile-service` thực hiện. Ngoại lệ khác phải được cả nhóm thống nhất và ghi
  chú tại đây trước khi code.
- Dữ liệu mà service khác cần để lọc/xếp hạng (trạng thái xác thực mentor, số mentee đang hướng dẫn,
  rating) được mentoring-service **đồng bộ chủ động** sang profile-service qua `/internal/mentor/**`.
- Schema nằm trong `db/init/<service-name>.sql`, chạy tự động khi volume CSDL được tạo lần đầu
  (`docker compose down -v` để khởi tạo lại). Hibernate đặt `ddl-auto: none` — file SQL là nguồn sự thật.
- Khoá chính `UUID`; thời gian `TIMESTAMPTZ`; trạng thái `TEXT` + `CHECK`.

## 8. Environment & ports

| Service | Port | DB port (Postgres) |
|---|---|---|
| auth-service | 8081 | 5433 |
| profile-service | 8082 | 5434 |
| mentoring-service | 8083 | 5435 |
| payment-service | 8084 | 5436 |
| learning-service | 8085 | 5437 |
| matching-service | 8090 | (đọc DB 5434 của profile-service bằng role `matching_reader`) |
| ai-service | 8091 | — (không lưu trạng thái) |
| frontend (Next.js) | 3000 | — |
| Redis | 6379 | — |

## 9. Kiểm thử

- Mỗi thay đổi logic nghiệp vụ/thuật toán AI phải kèm unit test (`mvn test`, `pytest`).
- Mỗi tiêu chí nghiệm thu (SRD mục 6) có kiểm tra tương ứng trong `scripts/e2e_acceptance.py`; tính năng
  mới ảnh hưởng luồng chính phải bổ sung kiểm tra e2e.
- Engine AI rule-based phải tất định để test ổn định; engine LLM luôn có fallback.

## 10. Scope đã chốt (không mở rộng nếu chưa thống nhất nhóm)

- Trong scope: Auth, Career Profile, Learning Hub, AI Matching (embedding + pgvector), AI Interview,
  CV Parsing + Chatbot enrichment, Mentoring workflow, Payment (sandbox) + Referral.
- Ngoài scope: chatbot trợ lý học tập độc lập (chỉ giữ chatbot enrichment hẹp phục vụ matching),
  chatbot A2A, WebRTC video call, AI phân tích giọng nói, SMTP thật, cổng thanh toán thật.
- AI Interview do **Thắng** phụ trách: tính toán AI ở `ai-service/app/interview`, luồng & dữ liệu ở `mentoring-service`.
- CV Parsing + Chatbot enrichment do **Quang** phụ trách: tính toán AI ở `ai-service/app/cv`, `app/enrichment`;
  luồng & dữ liệu ở `mentoring-service`; cập nhật hồ sơ qua `POST /api/profile/mentee/{userId}/enrichment-chat`.
- Nhà cung cấp LLM: **DeepSeek API** (JSON Output mode), cấu hình bằng `DEEPSEEK_*` chỉ ở ai-service.
