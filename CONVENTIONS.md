# CONVENTIONS — Mentor-Mentee Learning Platform

## 1. Service ownership

| Người phụ trách | Backend services | Frontend feature folders | Tính năng AI tự bảo vệ |
|---|---|---|---|
| Phạm Ngọc Quang (A) | `auth-service` (8081), `learning-service` (8085), `ai-service/app/cv`, `ai-service/app/enrichment` | `frontend/src/features/auth`, `frontend/src/features/learning` | CV Parsing + Chatbot enrichment |
| Phạm Ninh Phương Thảo (B) | `profile-service` (8082), `matching-service` (8090) | `frontend/src/features/profile`, `frontend/src/features/matching` | AI Matching |
| Đinh Quyết Thắng (C) | `mentoring-service` (8083), `payment-service` (8084), `ai-service/app/interview` | `frontend/src/features/mentoring`, `frontend/src/features/payment` | AI Interview |


`ai-service` (8091, Python) có đồng sở hữu theo module: `app/interview/` (Thắng), `app/cv/` và
`app/enrichment/` (Quang); phần dùng chung (`app/llm/`, `app/engines.py`, `app/db.py`, `app/main.py`,
`app/security.py`, `app/clients/`, `app/storage.py`) cần cả hai review.

**Toàn bộ 3 tính năng AI nằm ở Python** — cả luồng nghiệp vụ lẫn dữ liệu. Không service Java nào
được thêm lại logic AI: mentoring-service chỉ giữ mentoring workflow, profile-service chỉ giữ hồ sơ.
Cụ thể với AI Matching: **embedding thuộc matching-service, không thuộc profile-service** — chuẩn hoá
text, chạy model, lưu vector, hash tái sử dụng (NFR-7) và job đồng bộ đều nằm ở `matching-service`, dữ
liệu ở `matching_db`. profile-service chỉ báo `POST /internal/embeddings/reindex` sau khi lưu hồ sơ,
theo kiểu bắn-rồi-quên: nó không chờ kết quả, không lưu vector và không có endpoint nào về embedding.
ai-service gọi ngược profile-service (trạng thái xác thực mentor, goal sau enrichment) và
mentoring-service (`POST /internal/notifications`) bằng header `X-Internal-Token`; mọi thay đổi ở các
endpoint đó phải cập nhật contract trước.

Trang giao diện (`frontend/src/app/**`) thuộc người sở hữu feature mà trang đó gọi API chính.

**Ngoại lệ cho giao diện dùng chung:** design system (`frontend/design-system/**`, `src/styles/**`,
`src/components/ui/**`, `src/components/shell/**`) là của chung, ai cũng được sửa. Thay đổi thuần
trình bày (bố cục, màu, chữ, thứ tự hiển thị, ẩn/hiện chi tiết) ở bất kỳ trang nào cũng không cần
người sở hữu feature duyệt trước, miễn là không đổi lời gọi API, dữ liệu gửi đi hay luật nghiệp vụ;
đổi những thứ đó vẫn theo quyền sở hữu ở trên. PR chỉ cần báo cho người sở hữu các trang bị ảnh hưởng.

### Nguyên tắc UI/UX

- **Một hành động chính mỗi màn hình**: chỉ một nút `primary`; hành động khác dùng `secondary`/`ghost`/link.
- **Tóm tắt trước, chi tiết khi cần** (progressive disclosure, tối đa 2 tầng): giải thích dài, phân
  rã điểm, bộ lọc nâng cao để sau nút "Xem chi tiết" / `<details>`.
- **Ít lựa chọn cùng lúc** (Hick's Law): danh sách gợi ý hiện ít mục nổi bật trước, phần còn lại
  sau "Xem thêm".
- **Màu có nghĩa**: chỉ `accent` cho hành động/mục chọn, màu trạng thái cho trạng thái; không dùng nhiều
  màu để trang trí hoặc mã hoá dữ liệu khi một màu với độ đậm nhạt là đủ.
- **Không lặp lại**: một thông tin/CTA chỉ xuất hiện một lần trên màn hình; ẩn ô số liệu bằng 0 và
  thẻ trống thừa với người dùng mới, thay bằng một bước tiếp theo rõ ràng.
- **Onboarding ngắn**: mentee đi tới gợi ý mentor đầu tiên trong ≤ 3 bước; câu hỏi nào cũng ghi rõ
  vì sao hỏi; thông tin không bắt buộc (CV, lịch học) hỏi sau khi người dùng đã thấy giá trị.

## 2. Git workflow

- **Trunk-based development**: nhánh `main` luôn deployable. Làm việc trên nhánh ngắn hạn
  `feature/<service>-<mo-ta-ngan>`, ví dụ `feature/matching-topk-retrieval`.
- **Squash merge** khi merge vào `main` — mỗi PR gộp thành 1 commit.
- Commit message theo Conventional Commits: `feat(matching): add top-k retrieval endpoint`,
  `fix(matching): correct embedding save on update`.
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
  matching-service và ai-service). Không tự chọn thuật toán khác HS256.
- Kiểm tra quyền: role bằng `@PreAuthorize` (Java) / `Depends(require_role(...))` (Python); quyền sở hữu
  bằng `CurrentUser.requireAccess(ownerId)` (Java) / `AuthUser.require_access(owner_id)` (Python).
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
    main.py          app, lifespan (load model + IndexSyncJob), exception handler
    config.py        biến môi trường
    security.py      xác minh JWT / internal token / ADMIN
    db.py            asyncpg pool: matching_db (read-write) + profile_db (read-only)
    routers/         index.py (reindex, index-status, admin rebuild), matching.py
    services/        embedding_service.py (model), profile_text.py (chuẩn hoá + hash),
                     index_service.py (vòng đời chỉ mục), matching_pipeline.py
    jobs/            index_sync.py — đồng bộ chỉ mục với profile_db
    schemas/         Pydantic model
  tests/
  requirements.txt  requirements-dev.txt  Dockerfile
```

ai-service tổ chức theo tính năng: `app/interview/`, `app/cv/`, `app/enrichment/`. Mỗi thư mục tính năng có
`models.py` (model của engine), `rule_based.py`, `deepseek_*.py`, `engine.py` (chọn engine + fallback),
`repository.py` (SQL), `service.py` (luồng nghiệp vụ), `views.py` (model response). Phần dùng chung:
`app/llm/deepseek.py`, `app/db.py` (pool asyncpg tới `ai_db`), `app/clients/` (gọi service khác),
`app/storage.py` (file CV), `app/security.py`, `app/routers/`.

Quy ước code: engine LLM luôn phải có fallback rule-based; engine chạy đồng bộ nên được gọi qua
`run_in_threadpool`; **không gọi engine/mạng bên trong transaction** — gọi xong mới mở transaction ghi
kết quả (giống quy tắc `TransactionTemplate` ở các service Java).

## 7. Database

- **1 database riêng cho mỗi service** — không service nào ghi trực tiếp vào DB của service khác.
- **Ngoại lệ đã được duyệt**: `matching-service` được phép **đọc (READ-ONLY)** trực tiếp các bảng
  `mentor_profiles`, `mentee_profiles`, `mentor_availability` trong DB của `profile-service`, để (a) lấy
  text nguồn cho embedding mà không cần profile-service biết format text, và (b) lấy dữ kiện lọc/xếp
  hạng mentor ngay trong PostgreSQL thay vì gọi HTTP cho từng ứng viên. Kết nối dùng role
  `matching_reader` chỉ có quyền `SELECT` (tạo trong `db/init/profile-service.sql`). Mọi thao tác WRITE
  vào các bảng này chỉ do `profile-service` thực hiện. Ngoại lệ khác phải được cả nhóm thống nhất và ghi
  chú tại đây trước khi code. Lý do và hệ quả: `docs/adr.md` ADR-01. Hệ quả cần nhớ: **đổi tên/xoá cột**
  trong 3 bảng trên phải báo người phụ trách matching-service (`_SPEC` trong `index_service.py`, câu
  SELECT trong `matching_pipeline.py`).
- **Chỉ mục embedding thuộc `matching_db`** (`mentor_embeddings`, `mentee_embeddings`): vector, hash
  của text nguồn và trạng thái index. Nguồn sự thật của nội dung hồ sơ vẫn là `profile_db`; chỉ mục tự
  hội tụ về nguồn nhờ `IndexSyncJob` so hash định kỳ, nên thông báo từ profile-service chỉ để giảm độ
  trễ chứ không phải điều kiện đúng đắn.
- Dữ liệu mà service khác cần để lọc/xếp hạng được **đồng bộ chủ động** sang profile-service qua
  `/internal/mentor/**`: số mentee đang hướng dẫn và rating do mentoring-service đẩy; trạng thái xác thực
  mentor do ai-service đẩy sau mỗi bước của AI Interview.
- Schema nằm trong `db/init/<service-name>.sql`, chạy tự động khi volume CSDL được tạo lần đầu
  (`docker compose down -v` để khởi tạo lại — **xoá dữ liệu**). Hibernate đặt `ddl-auto: none`. Thay đổi
  schema sau baseline đi qua **migration** ở mọi service (Flyway `db/migration/V<n>__*.sql` cho Java, V1 =
  baseline `db/init`; runner `migrations/NNN_*.sql` + bảng `schema_migrations` cho Python), không sửa
  `db/init`, không cần `down -v`; quy trình ở `docs/deployment-guide.md` mục 8.1, quyết định ở ADR-06.
- Khoá chính `UUID`; thời gian `TIMESTAMPTZ`; trạng thái `TEXT` + `CHECK`.

## 8. Environment & ports

| Service | Port | DB port (Postgres) |
|---|---|---|
| auth-service | 8081 | 5433 |
| profile-service | 8082 | 5434 |
| mentoring-service | 8083 | 5435 |
| payment-service | 8084 | 5436 |
| learning-service | 8085 | 5437 |
| matching-service | 8090 | 5439 (+ đọc DB 5434 của profile-service bằng role `matching_reader`) |
| ai-service | 8091 | 5438 |
| frontend (Next.js 14 + TypeScript) | 3000 | — |
| Redis | 6379 | — |

## 9. Kiểm thử

- Mỗi thay đổi logic nghiệp vụ/thuật toán AI phải kèm unit test (`mvn test`, `pytest`).
- Mỗi tiêu chí nghiệm thu (SRD mục 6) có kiểm tra tương ứng trong `scripts/e2e_acceptance.py`; tính năng
  mới ảnh hưởng luồng chính phải bổ sung kiểm tra e2e.
- Engine AI rule-based phải tất định để test ổn định; engine LLM luôn có fallback.

## 10. Scope đã chốt (không mở rộng nếu chưa thống nhất nhóm)

- Trong scope: Auth, Career Profile, Learning Hub, AI Matching (embedding + pgvector, do
  matching-service sở hữu trọn vẹn), AI Interview,
  CV Parsing + Chatbot enrichment, Mentoring workflow, Payment (sandbox) + Referral.
- Ngoài scope: chatbot trợ lý học tập độc lập (chỉ giữ chatbot enrichment hẹp phục vụ matching),
  chatbot A2A, WebRTC video call, AI phân tích giọng nói, SMTP thật, cổng thanh toán thật.
- AI Interview do **Thắng** phụ trách: toàn bộ ở `ai-service/app/interview` (luồng + dữ liệu).
- CV Parsing + Chatbot enrichment do **Quang** phụ trách: toàn bộ ở `ai-service/app/cv`, `app/enrichment`;
  cập nhật hồ sơ qua `POST /api/profile/mentee/{userId}/enrichment-chat`.
- Nhà cung cấp LLM: **DeepSeek API** (JSON Output mode), cấu hình bằng `DEEPSEEK_*` chỉ ở ai-service.
