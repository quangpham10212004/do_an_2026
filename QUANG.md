# Tài liệu kỹ thuật phần của Phạm Ngọc Quang — MentorHub

Phần mềm: auth-service, learning-service và tính năng AI CV Parsing \+ Chatbot Enrichment. Tài liệu này mô tả chi tiết thiết kế, mã nguồn, CSDL, API, bảo mật, kiểm thử và các quyết định kỹ thật — dùng cho chương **Phân tích & Thiết kế** của báo cáo và chuẩn bị bảo vệ trước hội đồng. Mọi chi tiết dưới đây đã đối chiếu với mã nguồn thực tế; đường dẫn file được ghi kèm để kiểm chứng.

---

## Mục lục

1. [Tổng quan và phân công](#1-tổng-quan-và-phân-công)  
2. [auth-service — Xác thực, quản lý tài khoản và phân quyền](#2-auth-service)  
3. [learning-service — Learning Hub](#3-learning-service)  
4. [CV Parsing \+ Chatbot Enrichment — ai-service](#4-cv-parsing--chatbot-enrichment)  
5. [Cơ sở dữ liệu](#5-cơ-sở-dữ-liệu)  
6. [Bảo mật](#6-bảo-mật)  
7. [Kiểm thử](#7-kiểm-thử)  
8. [Trả lời câu hỏi hội đồng](#8-trả-lời-câu-hỏi-hội-đồng)

---

## 1\. Tổng quan và phân công

| Hạng mục | Công nghệ | Phụ trách |
| :---- | :---- | :---- |
| **auth-service** (cổng 8081\) | Java 21, Spring Boot 3.3, PostgreSQL 16, Redis | Quang |
| **learning-service** (cổng 8085\) | Java 21, Spring Boot 3.3, PostgreSQL 16 | Quang |
| **CV Parsing \+ Chatbot enrichment** | Python 3.11, FastAPI, pypdf, asyncpg, DeepSeek API (tuỳ chọn) | Quang |
| **Frontend feature folders** | Next.js 14, TypeScript | `frontend/src/features/auth`, `features/learning`, `features/ai` (phần CV \+ enrichment) |

Toàn bộ logic AI (CV Parsing \+ Chatbot enrichment) nằm trong `ai-service/app/cv/` và `ai-service/app/enrichment/` — đây là module do Quang sở hữu bên trong ai-service (Python). Phần dùng chung của ai-service (`app/llm/`, `app/engines.py`, `app/db.py`, `app/security.py`, `app/storage.py`, `app/clients/`) cần cả Quang và Thắng review (`CONVENTIONS.md` mục 1).

Nguyên tắc xuyên suốt:

- **Contract-first**: mọi endpoint định nghĩa trong `contracts/<service>.yaml` (OpenAPI 3.0.3) trước khi code.  
- **Không gọi mạng bên trong transaction DB**: phần ghi DB chạy trong `TransactionTemplate` (Java) hoặc `conn.transaction()` (Python); gọi engine/HTTP thực hiện ngoài transaction.  
- **Hàm nghiệp vụ thuần tách khỏi I/O** để unit test không phụ thuộc DB/mạng.

---

## 2\. auth-service

### 2.1 Trách nhiệm

auth-service (`auth-service/src/main/java/com/mmp/auth/`) đảm nhận:

- Đăng ký tài khoản mentor/mentee (tài khoản admin tạo sẵn khi khởi động).  
- Đăng nhập, cấp và làm mới JWT (access token \+ refresh token).  
- Xác thực email, quên mật khẩu / đặt lại mật khẩu.  
- Quản lý tài khoản cá nhân (đổi mật khẩu, cập nhật tên).  
- Admin: xem/khoá/mở khoá tài khoản, thống kê, nhật ký kiểm toán.  
- Chống brute-force đăng nhập (Redis \+ fallback bộ nhớ trong).  
- Ghi audit log cho mọi hành động admin.  
- Gọi payment-service để ghi nhận referral khi đăng ký kèm mã giới thiệu.

### 2.2 Kiến trúc phân lớp

auth-service/src/main/java/com/mmp/auth/

  controller/        AuthController, AdminUserController, AuditController,

                     NotificationController, HealthController,

                     InternalDevEmailController

  service/           AuthService, TokenService, UserAdminService, AuditService,

                     PasswordResetService, EmailVerificationService,

                     LoginAttemptService, LoginRateLimit, RateLimiter,

                     AuditRetentionJob, EmailSender (+ SmtpEmailSender,

                     LoggingEmailSender), EmailTemplates, EmailRules,

                     NotificationEmailService

  client/            ReferralClient (gọi payment-service), ProfileClient

  security/          JwtService, JwtAuthenticationFilter, SecurityConfig,

                     CurrentUser, AuthUser, DevSecretsWarning

  entity/            User, RefreshToken, PasswordResetToken,

                     EmailOutbox, NotificationPreferences

  repository/        UserRepository, RefreshTokenRepository,

                     PasswordResetTokenRepository, EmailOutboxRepository,

                     NotificationPreferencesRepository

  dto/               AuthDtos, AuditDtos, NotificationDtos

  config/            AdminSeeder

  observability/     RequestIdFilter, MetricsController, RequestIds

  exception/         ApiException, ErrorResponse, GlobalExceptionHandler,

                     RateLimitedException

Kiến trúc tuân thủ mẫu chuẩn của các service Java trong dự án (xem `architecture.md` §2.1):

controller (REST, @PreAuthorize, validate DTO)

  → service (nghiệp vụ, @Transactional)

    → repository (Spring Data JPA / JdbcTemplate)

      → PostgreSQL (auth\_db)

client (RestClient gọi payment-service)

security (JwtAuthenticationFilter, SecurityConfig, CurrentUser)

exception (ApiException, GlobalExceptionHandler)

### 2.3 Cơ chế xác thực và phân quyền

#### 2.3.1 JWT (HS256, secret dùng chung)

| Thành phần | Chi tiết | Mã nguồn |
| :---- | :---- | :---- |
| Access token | JWT HS256, claims `sub` (userId), `email`, `role`, `ev` (email đã xác thực — US-39), `typ=access`, hạn 30 phút | `TokenService.issue()`, `JwtService.parse()` |
| Refresh token | Chuỗi ngẫu nhiên 256-bit (`SecureRandom`), DB chỉ lưu SHA-256, hạn 7 ngày, xoay vòng mỗi lần dùng | `TokenService.randomToken()`, `TokenService.sha256()` |
| Secret | `JWT_SECRET` (biến môi trường); fallback dev có cảnh báo WARN lúc khởi động; profile `prod` từ chối khởi động nếu còn giá trị dev | `DevSecretsWarning`, `application.yml` |

Các service khác tự xác minh JWT cục bộ (không gọi sang auth-service mỗi request) — package `security/` giống nhau ở 5 service Java. Token có thời hạn ngắn nên rủi ro token bị thu hồi là nhỏ; refresh tokenxoay vòng (rotation): token cũ bị `revoked = true` khi dùng để refresh. Dùng lại token đã thu hồi ⇒ thu hồi toàn bộ phiên của user (`AuthService.refresh()`).

#### 2.3.2 Phân quyền (RBAC)

| Role | Quyền | Cách hiện thực |
| :---- | :---- | :---- |
| `MENTEE` | Tạo/sửa hồ sơ mentee, tải CV, tìm mentor, gửi yêu cầu, thanh toán, học Learning Hub | `@PreAuthorize("hasRole('MENTEE')")` |
| `MENTOR` | Tạo/sửa hồ sơ mentor, lịch rảnh, AI Interview, nhận yêu cầu, quản lý phiên | `@PreAuthorize("hasRole('MENTOR')")` |
| `ADMIN` | Quản lý tài khoản, duyệt mentor, quản lý Learning Hub, giám sát giao dịch, xem audit log | `@PreAuthorize("hasRole('ADMIN')")` |
| `INTERNAL` | Service-to-service (`/internal/**`) | `JwtAuthenticationFilter` gắn khi `X-Internal-Token` khớp |

Kiểm tra chủ sở hữu: `CurrentUser.requireAccess(ownerId)` (Java) — so sánh userId trong JWT với `ownerId` trong path; admin luôn được phép.

#### 2.3.3 SecurityConfig

`SecurityConfig` (`security/SecurityConfig.java`):

- Stateless (session policy `STATELESS`), CSRF disable.  
- `/health`, `/actuator/health/**`, `/error`, `/metrics` công khai.  
- `app.security.public-paths`: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/verify-email`, `/api/auth/verify-token`, `/api/auth/forgot-password`, `/api/auth/reset-password`.  
- `/internal/**`: chỉ role `INTERNAL` (header `X-Internal-Token`).  
- Còn lại: bắt buộc đăng nhập; phân quyền chi tiết theo role bằng `@PreAuthorize`.  
- `BCryptPasswordEncoder` bean cho băm mật khẩu.  
- `JwtAuthenticationFilter` chạy trước `UsernamePasswordAuthenticationFilter`.

#### 2.3.4 JwtAuthenticationFilter

`JwtAuthenticationFilter` (`security/JwtAuthenticationFilter.java`) gắn danh tính vào `SecurityContext` cho mỗi request:

1. Header `X-Internal-Token` hợp lệ (so sánh hằng thời gian bằng `MessageDigest.isEqual`) ⇒ principal `INTERNAL` (service-to-service).  
2. Header `Authorization: Bearer <jwt>` hợp lệ ⇒ `JwtService.parse()` trả về `AuthUser(userId, email, role)`.  
3. Request không có thông tin xác thực vẫn đi tiếp; `SecurityConfig` quyết định endpoint nào yêu cầu đăng nhập.

### 2.4 Các luồng nghiệp vụ chính

#### 2.4.1 Đăng ký (FR-1.1)

`POST /api/auth/register` — `AuthController.register()` → `AuthService.register()`:

1. Email chuẩn hoá (`trim().toLowerCase()`), kiểm tra trùng (`existsByEmailIgnoreCase`).  
2. Tạo `User`: băm mật khẩu bằng BCrypt, gán role (chỉ `MENTOR` hoặc `MENTEE` — validation trong `RegisterRequest`), sinh `emailVerificationToken` ngẫu nhiên.  
3. Lưu user, gửi email xác thực (`EmailSender.send()` — chế độ `log` hoặc `smtp` qua `EMAIL_MODE`).  
4. Nếu có `referralCode`: gọi `ReferralClient.registerReferral(code, userId)` sang payment-service (mã sai không chặn đăng ký, chỉ trả `referralApplied = false`).  
5. Cấp cặp token (`TokenService.issue()`), trả `AuthResponse` (201 Created).  
6. `exposeVerificationToken = true` (demo không có SMTP): trả `emailVerificationToken` trong response để người dùng xác thực ngay; `false` (triển khai thật): chỉ gửi qua email.

Edge cases:

- Email đã tồn tại → 409 `EMAIL_ALREADY_EXISTS`, giữ nguyên dữ liệu form.  
- Role không hợp lệ (khác MENTOR/MENTEE) → 400 `VALIDATION_ERROR` (validation trong DTO).  
- Mật khẩu \< 8 hoặc \> 72 ký tự → 400 (`@Size(min=8, max=72)`).

#### 2.4.2 Đăng nhập (FR-1.2)

`POST /api/auth/login` — `AuthController.login()`:

1. `LoginRateLimit.check(http)`: tối đa 5 lần/phút/IP (US-46, NFR-10) — đếm cả lần đúng lẫn sai, dùng `RateLimiter` (Redis INCR \+ EXPIRE, fallback bộ nhớ trong).  
2. `LoginAttemptService.isBlocked(email)`: 5 lần sai liên tiếp → chặn email 15 phút (Redis key `auth:login-fail:<email>`, TTL 15 phút).  
3. Tìm user theo email, so khớp mật khẩu bằng `BCryptPasswordEncoder.matches()`.  
4. Sai mật khẩu → `LoginAttemptService.recordFailure()` → 401 `INVALID_CREDENTIALS` (thông điệp chung, không cho biết email có tồn tại).  
5. Tài khoản `LOCKED` → 403 `ACCOUNT_LOCKED`.  
6. Đúng → `LoginAttemptService.reset()` → cấp cặp token → `AuthResponse`.

#### 2.4.3 Làm mới token (refresh)

`POST /api/auth/refresh` — `AuthService.refresh()`:

1. Tìm refresh token theo `token_hash` (SHA-256 của token gửi lên).  
2. Token không dùng được (hết hạn hoặc đã thu hồi):  
   - Nếu đã `revoked` → có thể bị đánh cắp → `revokeAllForUser(userId)` (thu hồi toàn bộ phiên).  
   - Ném 401\.  
3. Token hợp lệ → `revoked = true` (xoay vòng) → cấp cặp token mới.  
4. Tài khoản `LOCKED` → 403 `ACCOUNT_LOCKED`.

#### 2.4.4 Đăng xuất

`POST /api/auth/logout` — `AuthService.logout()`: tìm refresh token, đặt `revoked = true` (204).

#### 2.4.5 Xác thực email

- `GET /api/auth/verify-email?token=` — `AuthService.verifyEmail()`: tìm user theo token, đặt `email_verified = true`, xoá token.  
- `POST /api/auth/me/resend-verification` (US-39, PRD-AUTH-3) — `EmailVerificationService.resend()`: tối đa 3 lần/giờ (Redis `RateLimiter`), mỗi lần tạo token mới (link cũ hết hiệu lực), email gửi ngoài transaction. Các service khác chặn gửi yêu cầu/đặt lịch/thanh toán khi `ev = false` (403 `EMAIL_NOT_VERIFIED`); token thiếu `ev` (cấp trước US-39) coi như `true`.

#### 2.4.6 Quên mật khẩu / đặt lại mật khẩu (US-09, PRD-AUTH-1)

`PasswordResetService` (`service/PasswordResetService.java`):

- `POST /api/auth/forgot-password`: luôn trả 202 (không tiết lộ email có tồn tại). Tối đa 3 yêu cầu/giờ/email (Redis `RateLimiter`). Nếu email tồn tại và tài khoản `ACTIVE`: vô hiệu token cũ, tạo token 32-byte ngẫu nhiên (DB lưu SHA-256, hạn 30 phút, dùng một lần), gửi email.  
- `POST /api/auth/reset-password`: kiểm tra token hợp lệ, dùng `consume()` (atomic, một lần), đổi mật khẩu, thu hồi mọi refresh token, xoá bộ đếm đăng nhập sai.

#### 2.4.7 Quản lý tài khoản

- `GET /api/auth/me` — thông tin tài khoản (`AuthService.me()`).  
- `PUT /api/auth/me` — cập nhật `fullName` (`AuthService.updateMe()`).  
- `POST /api/auth/me/change-password` — đổi mật khẩu: kiểm tra mật khẩu cũ, băm mật khẩu mới, thu hồi mọi refresh token (đăng xuất các thiết bị khác).

#### 2.4.8 Admin quản lý người dùng (FR-1.5)

`AdminUserController` (`@PreAuthorize("hasRole('ADMIN')")`):

- `GET /api/auth/admin/users?role=&q=&page=&size=` — danh sách phân trang, lọc theo role và từ khoá.  
- `GET /api/auth/admin/users/stats` — `{total, mentors, mentees}`.  
- `PATCH /api/auth/admin/users/{userId}/status` — khoá/mở khoá:  
  - Không thể tự khoá chính mình (`CANNOT_LOCK_SELF`).  
  - Không thể khoá tài khoản ADMIN (`CANNOT_LOCK_ADMIN`).  
  - Khoá → thu hồi mọi refresh token, ghi audit log `USER_LOCKED`.  
  - Mở khoá → ghi audit log `USER_UNLOCKED`.

### 2.5 Nhật ký kiểm toán (US-30, PRD-ADM-5)

`AuditService` (`service/AuditService.java`):

- Bảng `audit_log` (append-only, trigger DB chặn UPDATE/DELETE; chỉ job `AuditRetentionJob` bật cờ `mmp.audit_retention_purge` mới xoá được).  
- `POST /internal/audit` — các service khác gọi kiểu bắn-rồi-quên.  
- `recordAdmin()` — ghi hành động admin của chính auth-service (khoá/mở khoá), chạy chung transaction với thay đổi nghiệp vụ.  
- `search()` — lọc theo actor, action, targetType, targetId, khoảng thời gian; phân trang, mới nhất trước.  
- `AuditRetentionJob` (`service/AuditRetentionJob.java`) — `@Scheduled` xoá dòng cũ hơn `AUDIT_RETENTION` (mặc định 730 ngày \= 2 năm), chạy 03:30 mỗi ngày (giờ Việt Nam).

`AuditController`:

- `GET /api/auth/admin/audit?...` — admin xem nhật ký (phân trang).  
- `POST /internal/audit` — service nội bộ ghi audit.

### 2.6 Chống brute-force

| Lớp | Cơ chế | Mã nguồn |
| :---- | :---- | :---- |
| Theo tài khoản | 5 lần sai liên tiếp → chặn email 15 phút (Redis `auth:login-fail:<email>`) | `LoginAttemptService` |
| Theo IP | 5 lần/phút/IP (Redis `rl:login:ip:<ip>`) — US-46, NFR-10 | `LoginRateLimit`, `RateLimiter` |
| Fallback | Redis lỗi → bộ đếm trong bộ nhớ (`ConcurrentHashMap`) | `LoginAttemptService`, `RateLimiter` |
| Quên mật khẩu | 3 yêu cầu/giờ/email (Redis `auth:pwd-reset:<email>`) | `PasswordResetService`, `RateLimiter` |
| Gửi lại email xác thực | 3 lần/giờ/user (Redis `resend-verification:<userId>`) | `EmailVerificationService`, `RateLimiter` |

`RateLimiter` (`service/RateLimiter.java`): fixed window counter, Redis INCR \+ EXPIRE; Redis lỗi → `ConcurrentHashMap` với `Window(count, expiresAt)`.

### 2.7 Email

| Chế độ | Mô tả | Cấu hình |
| :---- | :---- | :---- |
| `log` (mặc định) | Ghi log \+ hộp thư giả `GET /internal/dev/emails` | `EMAIL_MODE=log` |
| `smtp` | Mailpit SMTP 1025, giao diện 8025 (docker compose `--profile mail`) | `EMAIL_MODE=smtp` |

`EmailSender` interface, `LoggingEmailSender` (log), `SmtpEmailSender` (SMTP). `EmailTemplates` — template email xác thực, đặt lại mật khẩu. `EmailRules` — kiểm tra giờ yên tĩnh (22:00–07:00) cho email thông báo (trừ email bảo mật). `NotificationEmailService` — gửi email thông báo theo tuỳ chọn người dùng (US-38).

### 2.8 AdminSeeder

`config/AdminSeeder.java` (`@PostConstruct`): tạo tài khoản admin khi khởi động nếu chưa có, dùng `ADMIN_EMAIL` và `ADMIN_PASSWORD` từ biến môi trường (mặc định `admin@mmp.local` / `Admin@123`).

### 2.9 Cấu hình (`application.yml`)

| Biến | Mặc định | Ý nghĩa |
| :---- | :---- | :---- |
| `app.security.jwt-secret` | `dev-only-secret-...` | Secret JWT HS256 (cả 7 service dùng chung) |
| `app.security.internal-api-key` | `dev-internal-key` | Token service-to-service (`/internal/**`) |
| `app.jwt.access-token-ttl` | `PT30M` | Hạn access token (30 phút) |
| `app.jwt.refresh-token-ttl` | `P7D` | Hạn refresh token (7 ngày) |
| `app.login-protection.max-failed-attempts` | 5 | Số lần sai liên tiếp trước khi chặn |
| `app.login-protection.block-duration` | `PT15M` | Thời gian chặn (15 phút) |
| `app.rate-limit.login-per-minute` | 5 | Số lần đăng nhập tối đa/phút/IP |
| `app.audit.retention` | `P730D` | Thời gian giữ audit log (730 ngày) |
| `app.expose-verification-token` | `true` (demo) | Trả token xác thực trong response đăng ký |
| `app.admin.email` / `app.admin.password` | `admin@mmp.local` / `Admin@123` | Tài khoản admin seed |
| `app.email.mode` | `log` | `log` hoặc `smtp` |

---

## 3\. learning-service

### 3.1 Trách nhiệm

learning-service (`learning-service/src/main/java/com/mmp/learning/`) quản lý nội dung học tập:

- Khoá học (courses) và tài liệu (course\_materials) theo chủ đề/lĩnh vực.  
- Roadmap (lộ trình nghề nghiệp) gồm các bước (roadmap\_items), mỗi bước có thể liên kết khoá học.  
- Tiến độ học: đăng ký khoá, đánh dấu hoàn thành tài liệu, tính % hoàn thành.  
- Admin quản lý nội dung: thêm/sửa/xoá khoá học, tài liệu, roadmap, bước roadmap.

### 3.2 Kiến trúc phân lớp

learning-service/src/main/java/com/mmp/learning/

  controller/        LearningController, AdminLearningController, HealthController

  service/           LearningService

  repository/        CourseRepository, CourseMaterialRepository, CourseProgressRepository,

                     RoadmapRepository, RoadmapItemRepository, ProgressJdbcRepository

  entity/            Course, CourseMaterial, CourseProgress, Roadmap, RoadmapItem

  dto/               LearningDtos

  security/          JwtService, JwtAuthenticationFilter, SecurityConfig,

                     CurrentUser, AuthUser, DevSecretsWarning

  observability/     RequestIdFilter, MetricsController, RequestIds

  exception/         ApiException, ErrorResponse, GlobalExceptionHandler

### 3.3 Cơ sở dữ liệu (learning\_db)

7 bảng (xem `db/init/learning-service.sql` và `database-design.md` §7):

| Bảng | Khóa chính | Mô tả |
| :---- | :---- | :---- |
| `courses` | `id UUID` | Khoá học: title, description, domain, level (BEGINNER/INTERMEDIATE/ADVANCED), skills (text\[\]) |
| `course_materials` | `id UUID` | Tài liệu thuộc khoá: title, type (ARTICLE/VIDEO/DOCUMENT/EXERCISE), url, content, order\_index |
| `course_enrollments` | `(course_id, user_id)` | Đăng ký khoá (many-to-many) |
| `material_completions` | `(material_id, user_id)` | Đánh dấu hoàn thành tài liệu |
| `course_progress` | `(course_id, user_id)` | `% hoàn thành` của khoá cho từng user |
| `roadmaps` | `id UUID` | Lộ trình: title, track (Backend/Frontend/DevOps...), description |
| `roadmap_items` | `id UUID` | Bước roadmap: title, description, order\_index, `course_id` (FK, SET NULL khi xoá khoá) |
| `roadmap_item_progress` | `(item_id, user_id)` | Đánh dấu hoàn thành bước roadmap |

Dữ liệu seed (trong `db/init/learning-service.sql`): 5 khoá học, 15 tài liệu, 3 roadmap (Backend, DevOps, Frontend).

### 3.4 API endpoints

#### 3.4.1 Người dùng (`LearningController`, `/api/learning`)

| Method | Endpoint | Quyền | Mô tả |
| :---- | :---- | :---- | :---- |
| GET | `/courses?domain=&q=` | Auth | Danh sách khoá (kèm enrolled, % hoàn thành) |
| GET | `/me/courses` | Auth | Khoá đã đăng ký |
| GET | `/courses/{id}` | Auth | Chi tiết khoá \+ tài liệu \+ trạng thái hoàn thành |
| POST | `/courses/{id}/enroll` | Auth | Đăng ký học |
| DELETE | `/courses/{id}/enroll` | Auth | Huỷ đăng ký |
| GET | `/courses/{courseId}/progress/{userId}` | Owner | `{percentComplete}` |
| POST | `/materials/{id}/complete` | Auth | Đánh dấu hoàn thành tài liệu |
| DELETE | `/materials/{id}/complete` | Auth | Bỏ đánh dấu |
| GET | `/roadmaps` | Auth | Danh sách roadmap |
| GET | `/roadmaps/{id}` | Auth | Chi tiết roadmap \+ tiến độ |
| POST | `/roadmap-items/{id}/complete` | Auth | Đánh dấu hoàn thành bước |
| DELETE | `/roadmap-items/{id}/complete` | Auth | Bỏ đánh dấu |

#### 3.4.2 Admin (`AdminLearningController`, `/api/learning/admin`, `@PreAuthorize("hasRole('ADMIN')")`)

| Method | Endpoint | Mô tả |
| :---- | :---- | :---- |
| POST | `/courses` | Tạo khoá học |
| PUT | `/courses/{id}` | Sửa khoá |
| DELETE | `/courses/{id}` | Xoá khoá |
| POST | `/courses/{courseId}/materials` | Thêm tài liệu |
| PUT | `/materials/{id}` | Sửa tài liệu |
| DELETE | `/materials/{id}` | Xoá tài liệu |
| POST | `/roadmaps` | Tạo roadmap |
| PUT | `/roadmaps/{id}` | Sửa roadmap |
| DELETE | `/roadmaps/{id}` | Xoá roadmap |
| POST | `/roadmaps/{roadmapId}/items` | Thêm bước |
| PUT | `/roadmap-items/{id}` | Sửa bước |
| DELETE | `/roadmap-items/{id}` | Xoá bước |

### 3.5 Logic nghiệp vụ chính

#### 3.5.1 Tính % hoàn thành (`LearningService.computePercent`)

static float computePercent(long completed, long total) {

    if (total \<= 0\) return 0f;

    return Math.round(Math.min(completed, total) \* 1000f / total) / 10f;

}

`percent_complete = số tài liệu đã hoàn thành / tổng số tài liệu × 100` (làm tròn 1 chữ số thập phân). Tính lại mỗi khi người dùng đánh dấu/bỏ đánh dấu một tài liệu (`recalculate()`).

Edge cases:

- Khoá chưa có tài liệu → 0%.  
- Tài liệu bị xoá sau khi hoàn thành → `min(completed, total)` đảm bảo không vượt 100%.

#### 3.5.2 Đăng ký và đánh dấu hoàn thành

`ProgressJdbcRepository` (`repository/ProgressJdbcRepository.java`): các bảng many-to-many (enrollment, completion) thao tác bằng JDBC với `ON CONFLICT DO NOTHING` (idempotent):

INSERT INTO course\_enrollments (course\_id, user\_id) VALUES (?, ?) ON CONFLICT DO NOTHING

INSERT INTO material\_completions (material\_id, user\_id) VALUES (?, ?) ON CONFLICT DO NOTHING

`setMaterialCompleted()`: tự ghi danh (enroll) nếu chưa đăng ký, đánh dấu hoàn thành, tính lại %.

#### 3.5.3 Roadmap

`roadmapDetail()`: tải danh sách `roadmap_items` theo `order_index`, kiểm tra bước nào đã hoàn thành, gắn `courseTitle` từ bảng `courses` (nếu `course_id` không null). `% hoàn thành` của roadmap \= số bước hoàn thành / tổng số bước × 100\.

#### 3.5.4 Admin quản lý nội dung

`saveCourse()`, `saveMaterial()`, `saveRoadmap()`, `saveRoadmapItem()`: tạo mới hoặc cập nhật (dựa trên `id == null`). `domain` chuẩn hoá (`trim().toLowerCase()`). `skills` lọc trùng và trim. `order_index` tự tăng khi tạo mới. `deleteCourse()` xoá mềm (xem edge case dưới).

### 3.6 Edge cases

| Trường hợp | Xử lý |
| :---- | :---- |
| Admin xoá khoá đang có người học | `ON DELETE CASCADE` xoá materials, enrollments, progress; roadmap\_items `course_id` → `SET NULL` (bước vẫn còn, chỉ mất liên kết khoá) |
| Admin thêm tài liệu mới vào khoá đã hoàn thành | `% tiến độ` được tính lại theo tổng tài liệu mới (`recalculate()`) |
| Đánh dấu hoàn thành nhiều lần | `ON CONFLICT DO NOTHING` — chỉ ghi 1 lần |
| Khoá chưa có tài liệu | `% = 0` |
| Người dùng chưa đăng ký mà đánh dấu hoàn thành | `setMaterialCompleted` tự `enroll()` rồi mới đánh dấu |

### 3.7 Cấu hình (`application.yml`)

server.port: 8085

spring.datasource.url: jdbc:postgresql://\${DB\_HOST}:\${DB\_PORT:5437}/\${DB\_NAME:learning\_db}

app.security.jwt-secret: \${JWT\_SECRET:dev-only-secret-...}

app.security.internal-api-key: \${INTERNAL\_API\_KEY:dev-internal-key}

Schema do Flyway quản lý (`db/migration/V1__baseline.sql` \= `db/init/learning-service.sql`).

---

## 4\. CV Parsing \+ Chatbot Enrichment

### 4.1 Bài toán

Mentee thường khai báo mục tiêu ngắn và chung chung ("học backend"), khiến embedding kém phân biệt. Tính năng này:

1. Đọc CV (PDF) để biết **mentee đã có gì** (kỹ năng, kinh nghiệm, dự án).  
2. Hỏi thêm vài câu về **những gì CV không thể hiện** (mục tiêu, mảng muốn tập trung, khó khăn, thời gian).  
3. Tổng hợp thành đoạn mục tiêu chuẩn hoá và cập nhật hồ sơ → matching-service **lập lại chỉ mục** → matching chính xác hơn.

Chatbot **không phải chatbot hỏi đáp độc lập**: đầu ra duy nhất của nó là dữ liệu đầu vào tốt hơn cho AI Matching.

### 4.2 Vị trí trong kiến trúc

Toàn bộ tính năng này nằm trong `ai-service` (Python/FastAPI, cổng 8091):

ai-service/app/

  cv/                    CV Parsing (Quang)

    extractor.py          trích văn bản từ PDF (pypdf)

    skills.py             từ điển kỹ năng (86 kỹ năng chuẩn)

    rule\_based.py         parser CV dựa trên luật

    deepseek\_parser.py    parser CV dùng DeepSeek (JSON Output mode)

    engine.py             façade chọn engine (DeepSeek \+ fallback)

    models.py             ParsedCv, ConfirmedFields (Pydantic)

    repository.py         SQL trên cv\_documents (ai\_db)

  enrichment/             Chatbot enrichment (Quang)

    rule\_based.py         chatbot dựa trên luật (theo slot)

    deepseek\_engine.py    chatbot dùng DeepSeek

    engine.py             façade chọn engine

    service.py            luồng nghiệp vụ FR-8.1 → FR-8.5

    views.py              model response (JSON camelCase)

    models.py             MenteeContext, Exchange, NextQuestion

    repository.py         SQL trên enrichment\_conversations/messages

  llm/deepseek.py         client DeepSeek (dùng chung với AI Interview)

  engines.py              chọn engine DEEPSEEK / RULE\_BASED

  storage.py              lưu/đọc/xoá file CV trên volume

  clients/profile.py     gọi profile-service (tìm mentee, đồng bộ goal)

  clients/mentoring.py    gọi mentoring-service (kiểm tra quan hệ, thông báo)

  routers/cv.py           endpoint CV Parsing

  routers/enrichment.py   endpoint chatbot enrichment

Dữ liệu nằm trong `ai_db` của ai-service; file CV trên volume `cv-storage`.

### 4.3 Luồng xử lý

sequenceDiagram

    autonumber

    actor M as Mentee

    participant AI as ai-service

    participant DB as ai\_db

    participant P as profile-service

    participant X as matching-service

    M-\>\>AI: POST /api/ai/mentee/{id}/cv-upload (PDF \+ consentExternalAi)

    AI-\>\>P: GET hồ sơ mentee (phải tồn tại)

    AI-\>\>AI: pypdf → parser (DeepSeek chỉ khi đồng ý) → ParsedCv

    AI-\>\>DB: lưu file CV \+ cv\_documents (KHÔNG ghi hồ sơ)

    AI--\>\>M: ParsedCv, conversation \= null

    M-\>\>AI: PUT /api/ai/cv/{cvId}/confirmed-fields (sửa/bỏ từng trường)

    M-\>\>AI: POST /api/ai/cv/{cvId}/enrichment-conversation

    AI-\>\>DB: hội thoại \+ câu hỏi 1 (dựa trên trường đã duyệt)

    AI--\>\>M: câu hỏi 1

    loop 4 lượt

        M-\>\>AI: POST /api/ai/enrichment/conversations/{id}/answers

        AI-\>\>AI: next-question (CV, lịch sử) — bỏ qua slot đã có

        AI--\>\>M: câu hỏi tiếp theo

    end

    AI-\>\>AI: summarize\_goal(CV đã duyệt, lịch sử) → enrichedGoal

    AI--\>\>M: COMPLETED, goalStatus \= DRAFT (hồ sơ chưa đổi)

    alt "Dùng mục tiêu này"

        M-\>\>AI: POST .../confirm-goal {goal, skills?}

        AI-\>\>P: POST /mentee/{id}/enrichment-chat {enrichedGoalText, cvSkills, cvFileUrl}

        P-\>\>P: cập nhật goal, gộp kỹ năng CV (không trùng)

        P-)X: POST /internal/embeddings/reindex (chỉ userId — không chờ kết quả)

        X-\>\>P: đọc hồ sơ (read-only), chuẩn hoá văn bản, hash đổi → embed lại

        AI--\>\>M: CONFIRMED (profileSynced \= true)

    else "Bỏ qua"

        M-\>\>AI: POST .../discard-goal → DISCARDED, không gửi gì

    end

### 4.4 CV Parsing

#### 4.4.1 Trích xuất văn bản PDF (`cv/extractor.py`)

Thư viện `pypdf`. Kiểm tra đầu vào (parse trước, lưu sau — file không hợp lệ thì không lưu gì):

| Kiểm tra | Mã lỗi | HTTP |
| :---- | :---- | :---- |
| File rỗng | `FILE_REQUIRED` | 400 |
| Không bắt đầu bằng `%PDF-` | `INVALID_FILE_TYPE` | 400 |
| \> 5MB (`MAX_CV_BYTES`) | `FILE_TOO_LARGE` | 413 |
| PDF đặt mật khẩu | `ENCRYPTED_PDF` | 400 |
| \> 10 trang (`MAX_PAGES = 10`) | `CV_TOO_LONG` | 400 |
| pypdf không đọc được | `INVALID_PDF` | 400 |
| Văn bản \< 50 ký tự (PDF ảnh scan) | `CV_NO_TEXT` | 400 |

#### 4.4.2 Parser rule-based (`cv/rule_based.py`, `cv/skills.py`)

| Trường | Thuật toán |
| :---- | :---- |
| Kỹ năng | Từ điển 86 kỹ năng chuẩn (`skills.py`), mỗi kỹ năng có nhiều biến thể regex (`postgres(ql)?`, `k8s`, `học máy`...), khớp theo ranh giới từ (tránh "Go" trong "Google", phân biệt "Java"/"JavaScript", "React"/"React Native"). Sắp xếp theo **số lần xuất hiện** (kỹ năng nhắc nhiều \= kỹ năng chính), hoà thì theo vị trí đầu tiên |
| Tiêu đề mục | Nhận diện heading tiếng Việt/Anh: Kinh nghiệm/Experience, Dự án/Projects, Học vấn/Education, Kỹ năng/Skills, các mục khác |
| Số năm KN | Ưu tiên câu tường minh "X+ năm kinh nghiệm"; nếu không có thì cộng các khoảng `MM/YYYY – MM/YYYY`, `YYYY – nay/present` **chỉ trong mục Kinh nghiệm** (dòng học vấn bị bỏ qua) |
| Dự án | Trong mục Dự án: dòng không gạch đầu dòng ≤ 80 ký tự \= tên dự án, dòng gạch đầu dòng sau \= mô tả; công nghệ \= kỹ năng tìm thấy trong tên \+ mô tả |
| Học vấn | Các dòng trong mục Học vấn |
| Vai trò | Dòng đầu CV chứa developer/engineer/lập trình viên/sinh viên... |

Sửa trong US-29 (có unit test `test_cv.py`): số năm KN chỉ đúng ±1 ở 15/20 CV ban đầu. Nguyên nhân: (1) CV hai cột trộn dòng ⇒ tiêu đề "Kinh nghiệm" không đứng riêng ⇒ không nhận ra mục; (2) dòng học vấn lọt vào mục kinh nghiệm và bị cộng; (3) khoảng chỉ có năm "2023 \- 2026" bị tính 01/2023 → 12/2026 \= 4 năm. Đã sửa: không nhận ra mục ⇒ xét mọi dòng trừ dòng học vấn; khoảng chỉ năm tính bằng hiệu số năm ⇒ 20/20.

#### 4.4.3 Parser DeepSeek (`cv/deepseek_parser.py`)

- Gọi DeepSeek Chat Completions ở JSON Output mode (`response_format: {"type": "json_object"}`).  
- System prompt yêu cầu **chỉ trích thông tin có trong CV, không suy đoán**; CV bọc trong thẻ `<cv>` (chống prompt injection).  
- Kết quả validate bằng Pydantic (`_Cv`), làm sạch (giới hạn 30 kỹ năng, 0–45 năm, 8 dự án).  
- Lỗi (API, JSON sai, rỗng) → fallback rule-based.

#### 4.4.4 Chọn engine (`cv/engine.py`)

def engine\_for(preferred: str \| None, allow\_external: bool) \-\> str:

    return engines.select(preferred) if allow\_external else engines.RULE\_BASED

US-19: `consentExternalAi = false` ⇒ luôn `RULE_BASED`, **không** hỏi tới client DeepSeek. Kiểm tra lại ở mỗi lượt từ cột `consent_external_ai` của CV — kể cả khi hội thoại cũ ghi `engine = DEEPSEEK`.

### 4.5 Chatbot Enrichment

#### 4.5.1 Thiết kế theo "slot"

Chatbot điền các **slot thông tin** mà CV thường không có:

| Slot | Nội dung | Khi nào hỏi |
| :---- | :---- | :---- |
| `TARGET_ROLE` | Mục tiêu nghề nghiệp | Luôn hỏi đầu tiên |
| `FOCUS_AREAS` | Mảng muốn đào sâu | Luôn hỏi |
| `PROJECT_EXPERIENCE` | Kinh nghiệm thực hành | **Chỉ khi CV không có dự án** |
| `CURRENT_GAPS` | Khó khăn hiện tại | Hỏi (nhắc tên dự án trong CV nếu có) |
| `TIMELINE` | Thời gian mong muốn | **Bỏ qua nếu câu trả lời trước đã nêu mốc thời gian** |
| `MENTORING_PREFERENCE` | Hình thức & tần suất mentoring | Khi còn lượt |
| `FREE_FORM` | Thông tin khác | Khi đã hết slot |

#### 4.5.2 "Không hỏi lại thông tin đã có" (FR-8.3)

Ba cơ chế:

1. **Câu hỏi tham chiếu** dữ liệu CV thay vì hỏi lại: *"Mình thấy CV của bạn có kinh nghiệm với Spring Boot, Docker, Java (khoảng 1 năm). Trong thời gian tới, bạn muốn đạt được mục tiêu nghề nghiệp cụ thể nào...?"*  
2. **Không hỏi slot mà CV đã trả lời**: có dự án → không hỏi `PROJECT_EXPERIENCE`.  
3. **Nhận diện trả lời gián tiếp**: regex mốc thời gian ("6 tháng", "cuối năm"...) chạy trên văn bản **đã bỏ dấu tiếng Việt** (`strip_accents`) nên hiểu cả câu gõ không dấu ("6 thang") → bỏ slot `TIMELINE`.

TIME\_MENTION \= re.compile(

    r"(\\d+\\s\*(thang\|tuan\|nam\|months?\|weeks?\|years?))\|(cuoi nam\|dau nam\|\\bquy\\b\|truoc tet\|deadline\|ky thuc tap\|hoc ky)",

    re.IGNORECASE)

def strip\_accents(s: str) \-\> str:

    decomposed \= unicodedata.normalize("NFD", s)

    return "".join(c for c in decomposed if not unicodedata.category(c).startswith("M")).replace("đ", "d").replace("Đ", "D")

#### 4.5.3 Số lượt

4 lượt (`ENRICHMENT_MAX_TURNS`, cấu hình qua biến môi trường).

#### 4.5.4 Tổng hợp goal (FR-8.4)

Rule-based ghép theo mẫu:

Mục tiêu: \<TARGET\_ROLE\>. Muốn tập trung vào: \<FOCUS\_AREAS\>. Khó khăn hiện tại: \<CURRENT\_GAPS\>.

Thời gian mong muốn: \<TIMELINE\>. Nền tảng hiện có (từ CV): \<kỹ năng\>; khoảng N năm kinh nghiệm;

đã làm dự án \<tên dự án\>.

DeepSeek sinh đoạn mô tả 3–6 câu ở ngôi thứ ba từ CV \+ hội thoại (JSON `{"enriched_goal": ...}`), lỗi thì dùng mẫu rule-based.

#### 4.5.5 Cập nhật hồ sơ & re-embedding (FR-8.5)

Chỉ sau khi mentee **xác nhận goal** (US-21):

1. Gửi `enrichedGoalText` (goal đã xác nhận), `cvSkills` (chỉ kỹ năng đã duyệt), `cvFileUrl` sang profile-service (`POST /api/profile/mentee/{id}/enrichment-chat`).  
2. profile-service cập nhật goal, **gộp** kỹ năng (không trùng, không phân biệt hoa thường).  
3. Văn bản chuẩn hoá thay đổi → hash đổi → matching-service sinh lại embedding.  
4. Nếu gửi lỗi: cờ `profile_synced = false`, job `retry_profile_sync_forever` thử lại mỗi 2 phút (chỉ goal `CONFIRMED`; bỏ qua xác nhận \< 60 giây để không gửi trùng).

### 4.6 US-19 → US-21: quyền riêng tư và kiểm soát người dùng

| Story | Nội dung | Mã nguồn |
| :---- | :---- | :---- |
| US-19 | `consentExternalAi` bắt buộc khi tải CV; `false` ⇒ chỉ rule-based cho CV đó (parse \+ chatbot) | `cv/engine.py`, `routers/cv.py` |
| US-20 | Parse không ghi hồ sơ; người dùng duyệt/sửa/bỏ từng trường (`confirmed_fields`); chatbot chỉ bắt đầu sau khi duyệt, chỉ dùng `confirmed_fields` | `enrichment/service.py::confirm_fields`, `start_conversation` |
| US-21 | Goal là bản nháp (`DRAFT`); chỉ `confirm-goal` mới đồng bộ hồ sơ (một lần, nguyên tử DRAFT → CONFIRMED); `discard-goal` không gửi gì | `enrichment/service.py::confirm_goal`, `discard_goal` |
| US-45 | Nút "Bỏ qua" cho câu chatbot; chọn kỹ năng thêm vào hồ sơ; gỡ kỹ năng khi xoá CV; file CV \+ văn bản gốc giữ 12 tháng | `enrichment/service.py`, `cv/repository.py` |

### 4.7 API endpoints

#### CV Parsing (`routers/cv.py`, `/api/ai`)

| Method | Endpoint | Quyền | Mô tả |
| :---- | :---- | :---- | :---- |
| POST | `/mentee/{id}/cv-upload` | MENTEE/ADMIN | Upload CV \+ parse (multipart: file \+ consentExternalAi) |
| POST | `/cv/parse` | Auth | Parse CV không kèm chatbot (mentor điền nhanh hồ sơ) |
| PUT | `/cv/{cvId}/confirmed-fields` | Chủ CV | US-20: duyệt/sửa/bỏ từng trường |
| POST | `/cv/{cvId}/enrichment-conversation` | MENTEE | Bắt đầu chatbot (409 nếu chưa duyệt) |
| GET | `/cv/{cvId}/file` | Chủ CV/Admin/Mentor có quan hệ | Tải file PDF gốc (fail-closed) |
| GET | `/cv/mine` | Auth | CV của chính người gọi |
| DELETE | `/cv/{cvId}` | Chủ CV/ADMIN | Xoá CV (204); `removeSkills=true`: gỡ kỹ năng |

Rate limit (US-46): tối đa 5 CV/giờ/người dùng (`CV_UPLOADS_PER_HOUR`).

#### Chatbot enrichment (`routers/enrichment.py`, `/api/ai`)

| Method | Endpoint | Quyền | Mô tả |
| :---- | :---- | :---- | :---- |
| GET | `/mentee/{id}/enrichment/latest` | Owner | CV \+ hội thoại gần nhất (204 nếu chưa có) |
| GET | `/enrichment/conversations/{id}` | Owner | Chi tiết hội thoại |
| POST | `/enrichment/conversations/{id}/answers` | MENTEE | Trả lời (hoặc bỏ qua — US-45) |
| POST | `/enrichment/conversations/{id}/confirm-goal` | MENTEE | US-21: "Dùng mục tiêu này" (đồng bộ hồ sơ) |
| POST | `/enrichment/conversations/{id}/discard-goal` | MENTEE | US-21: "Bỏ qua" (không gửi gì) |

### 4.8 Lưu file CV (`storage.py`)

- Thư mục gốc: `CV_STORAGE_DIR` (volume `cv-storage` trong Docker).  
- Đường dẫn: `<user_id>/<uuid ngẫu nhiên>.pdf` — tên file gốc không dùng làm tên trên đĩa (chống ghi đè/chèn đường dẫn).  
- Đọc: `resolve()` \+ kiểm tra `is_relative_to(_root)` (chống path traversal) → 403 `FORBIDDEN`.  
- Xoá: file không còn → trả `False`, không làm hỏng việc xoá CV.

### 4.9 DeepSeek client (`llm/deepseek.py`)

- API tương thích OpenAI: `POST {DEEPSEEK_BASE_URL}/chat/completions`, header `Authorization: Bearer`.  
- JSON Output mode: `response_format: {"type": "json_object"}`; system prompt luôn chứa chữ "json"  
  + ví dụ mẫu (yêu cầu của DeepSeek).  
- Thử lại 1 lần: nội dung rỗng, lỗi 429/5xx/mạng.  
- 4xx khác, JSON sai, bị cắt do `max_tokens` → trả `None` (engine dùng rule-based).  
- Kết quả validate bằng Pydantic, kẹp miền giá trị.  
- `get_client()`: singleton, chỉ tạo khi có `DEEPSEEK_API_KEY`.

### 4.10 Đánh giá CV parsing (US-29, PRD 6.2)

Bộ dữ liệu: 20 CV PDF (`scripts/eval/cv/pdf/`), sinh từ `cv_data.py`. Ngôn ngữ: en=10, vi=10. Bố cục: classic, compact, table, timeline, two-column. Nhãn: `scripts/eval/cv/gold.csv`.

Kết quả rule-based (xem `docs/eval-cv.md`):

| Engine | CV | Precision | Recall | F1 | Mục tiêu F1 | Năm KN ±1 |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| RULE\_BASED | 20 | 0.993 | 0.933 | **0.962** | ≥ 0.6 — đạt | 20/20 |
| DEEPSEEK | — | — | — | chưa chạy (không có API key) | ≥ 0.8 | — |

Nguyên nhân lỗi chính: bỏ sót do từ điển không có (BLoC, Celery, Combine, Firebase, Objective-C, Redux, Scala, SwiftUI, WordPress). F1 rule-based nhiều khả năng **lạc quan** so với CV thật.

### 4.11 Quyền riêng tư CV

| Câu hỏi | Trả lời | Trạng thái |
| :---- | :---- | :---- |
| Lưu ở đâu? | File PDF trên volume `cv-storage`; văn bản \+ parse trong `cv_documents` (ai\_db) | ✅ |
| Giới hạn đầu vào? | PDF, ≤ 5MB, ≤ 10 trang, không mật khẩu, ≥ 50 ký tự | ✅ |
| Ai đọc file? | Chủ CV, ADMIN, nội bộ, mentor có yêu cầu PENDING/ACCEPTED (fail-closed) | ✅ |
| Gửi ra ngoài? | Chỉ khi server có `DEEPSEEK_API_KEY` **và** người dùng đồng ý (`consentExternalAi`) | ✅ US-19 |
| Lưu bao lâu? | File \+ văn bản gốc giữ 12 tháng (US-45); xoá theo yêu cầu | ✅ |
| Tự xoá? | `DELETE /api/ai/cv/{id}` (chủ CV/ADMIN) | ✅ |
| Mã hoá? | Không | ❌ chưa hiện thực |

Chi tiết: `docs/cv-data-policy.md`.

---

## 5\. Cơ sở dữ liệu

### 5.1 auth\_db (`db/init/auth-service.sql`)

CREATE TABLE users (

    id                        UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    email                     TEXT UNIQUE NOT NULL,

    password\_hash             TEXT NOT NULL,

    full\_name                 TEXT,

    role                      TEXT NOT NULL CHECK (role IN ('MENTOR', 'MENTEE', 'ADMIN')),

    status                    TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED')),

    email\_verified            BOOLEAN NOT NULL DEFAULT false,

    email\_verification\_token  TEXT,

    created\_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated\_at                TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE TABLE refresh\_tokens (

    id          UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    user\_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token\_hash  TEXT UNIQUE NOT NULL,

    expires\_at  TIMESTAMPTZ NOT NULL,

    revoked     BOOLEAN NOT NULL DEFAULT false,

    created\_at  TIMESTAMPTZ NOT NULL DEFAULT now()

);

Ngoài CSDL: Redis key `auth:login-fail:<email>` (đếm đăng nhập sai, TTL 15 phút), `rl:login:ip:<ip>` (rate limit IP), `auth:pwd-reset:<email>` (rate limit quên mật khẩu), `resend-verification:<userId>`.

Migration (Flyway): `V1__baseline.sql` \= `db/init`, `V2__password_reset_tokens.sql`, `V3__audit_log.sql`, `V4__notification_email.sql`, `V5__grandfather_verified_email.sql`.

### 5.2 learning\_db (`db/init/learning-service.sql`)

7 bảng (xem mục 3.3). Migration: `V1__baseline.sql` \= `db/init`.

### 5.3 ai\_db — bảng CV \+ enrichment (`db/init/ai-service.sql`)

CREATE TABLE cv\_documents (

    id                UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    user\_id           UUID NOT NULL,

    file\_name         TEXT NOT NULL,

    storage\_path      TEXT NOT NULL,

    raw\_text          TEXT NOT NULL,

    parsed\_json       JSONB NOT NULL,

    engine            TEXT NOT NULL,

    consent\_external\_ai BOOLEAN NOT NULL DEFAULT false,  \-- migration 002

    confirmed\_fields  JSONB,                              \-- migration 003

    confirmed\_at       TIMESTAMPTZ,

    purged\_at          TIMESTAMPTZ,                        \-- migration 008

    created\_at         TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE TABLE enrichment\_conversations (

    id              UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    mentee\_id       UUID NOT NULL,

    cv\_id           UUID NOT NULL REFERENCES cv\_documents(id),

    status          TEXT NOT NULL DEFAULT 'IN\_PROGRESS' CHECK (status IN ('IN\_PROGRESS', 'COMPLETED')),

    max\_turns       INTEGER NOT NULL,

    current\_turn    INTEGER NOT NULL DEFAULT 1,

    engine          TEXT NOT NULL,

    enriched\_goal   TEXT,

    goal\_status     TEXT NOT NULL DEFAULT 'NONE' CHECK (goal\_status IN ('NONE','DRAFT','CONFIRMED','DISCARDED')),  \-- migration 004

    confirmed\_goal  TEXT,

    goal\_decided\_at TIMESTAMPTZ,

    added\_skills    TEXT\[\] NOT NULL DEFAULT '{}',

    profile\_synced  BOOLEAN NOT NULL DEFAULT false,

    created\_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    completed\_at    TIMESTAMPTZ

);

CREATE TABLE enrichment\_messages (

    id               UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    conversation\_id   UUID NOT NULL REFERENCES enrichment\_conversations(id) ON DELETE CASCADE,

    turn\_no           INTEGER NOT NULL,

    slot              TEXT NOT NULL,

    question          TEXT NOT NULL,

    answer            TEXT,

    skipped           BOOLEAN NOT NULL DEFAULT false,  \-- migration 008

    asked\_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    answered\_at       TIMESTAMPTZ,

    UNIQUE (conversation\_id, turn\_no)

);

Migration (runner SQL `ai-service/app/migrations.py`): `001_baseline.sql` \= `db/init`, `002_cv_consent_external_ai.sql`, `003_cv_confirmed_fields.sql`, `004_enrichment_goal_confirmation.sql`, `008_cv_chat_skip_retention.sql`.

---

## 6\. Bảo mật

### 6.1 auth-service

| Cơ chế | Chi tiết |
| :---- | :---- |
| Băm mật khẩu | BCrypt (`BCryptPasswordEncoder`) |
| Access token | JWT HS256, 30 phút, claims `sub`, `email`, `role`, `ev`, `typ=access` |
| Refresh token | 256-bit ngẫu nhiên, DB lưu SHA-256, 7 ngày, xoay vòng |
| Chống brute-force | 5 lần sai/email → chặn 15 phút (Redis \+ fallback memory) |
| Rate limit IP | 5 lần/phút/IP (US-46) |
| Thu hồi | Đổi mật khẩu / bị khoá ⇒ thu hồi mọi refresh token |
| Phân quyền | `@PreAuthorize` theo role, `CurrentUser.requireAccess` theo chủ sở hữu |
| Service-to-service | `X-Internal-Token` (so sánh hằng thời gian) |
| Audit log | Append-only, trigger chặn UPDATE/DELETE, job xoá theo retention |
| Dev secrets | WARN nếu còn giá trị dev; profile `prod` chặn khởi động |

### 6.2 CV \+ Enrichment

| Cơ chế | Chi tiết |
| :---- | :---- |
| Upload file | Kiểm tra `%PDF-`, ≤ 5MB, ≤ 10 trang, không mã hoá, ≥ 50 ký tự |
| Lưu file | Đường dẫn `<user_id>/<uuid>.pdf`, chống path traversal (`is_relative_to`) |
| Truy cập file | Chủ CV, ADMIN, nội bộ; mentor chỉ khi có quan hệ PENDING/ACCEPTED (fail-closed, timeout 3s) |
| DeepSeek | Chỉ khi `DEEPSEEK_API_KEY` **và** người dùng đồng ý (`consentExternalAi`); nội dung bọc trong thẻ `<cv>`, `<answer>` |
| Prompt injection | System prompt yêu cầu coi nội dung trong thẻ là dữ liệu, bỏ qua chỉ dẫn bên trong |
| JSON validate | Kết quả DeepSeek validate bằng Pydantic, kẹp miền giá trị |
| Rate limit | 5 CV/giờ/người dùng |

---

## 7\. Kiểm thử

### 7.1 auth-service

| Test | Số test | Nội dung |
| :---- | :---- | :---- |
| `AuthServiceTest` | 8 | Đăng ký (băm mật khẩu, JWT HS256, referral), trùng email, đăng nhập sai (brute-force), tài khoản khoá, refresh (rotation \+ reuse detection), verifyToken, đổi mật khẩu |
| `PasswordResetServiceTest` | — | Quên mật khẩu (luôn 202, rate limit), đặt lại (token hợp lệ, hết hạn, đã dùng) |
| `LoginRateLimitTest` | — | Rate limit theo IP |
| `AuditServiceTest` | — | Ghi audit log, lọc, xoá theo retention |
| `NotificationEmailTest` | — | Tuỳ chọn email, giờ yên tĩnh |
| `DevSecretsWarningTest` | — | Cảnh báo bí mật dev |

Chạy: `cd auth-service && mvn test`.

### 7.2 learning-service

| Test | Số test | Nội dung |
| :---- | :---- | :---- |
| `LearningServiceTest` | 2 | `% hoàn thành` (làm tròn 1 chữ số, edge case: 0 tài liệu, tài liệu bị xoá) |
| `DevSecretsWarningTest` | — | Cảnh báo bí mật dev |

Chạy: `cd learning-service && mvn test`.

### 7.3 CV \+ Enrichment (ai-service)

| Test | Số test | Nội dung |
| :---- | :---- | :---- |
| `test_cv.py` | 13 | Trích xuất cấu trúc, số năm KN (tường minh, date range,ongoing, không tính học vấn), kỹ năng (tần suất, ranh giới từ), PDF, từ chối file |
| `test_enrichment_rule_based.py` | 7 | Câu hỏi đầu tiên tham chiếu CV, hỏi dự án khi CV không có, bỏ qua TIMELINE, bỏ dấu, không hỏi trùng slot, tổng hợp goal |
| `test_cv_consent.py` | 8 | US-19: đồng ý bắt buộc, lưu theo CV, không đồng ý ⇒ không gọi DeepSeek, kiểm tra mỗi lượt, đối chứng có đồng ý |
| `test_cv_review.py` | 9 | US-20: duyệt trường (làm sạch, validation), chỉ chủ CV, chat không bắt đầu trước khi duyệt, chat dùng confirmed\_fields |
| `test_goal_confirmation.py` | 11 | US-21: xác nhận (đồng bộ 1 lần, idempotent, concurrent), bỏ qua (không gửi gì), validation, chỉ owner, retry job |
| `test_cv_enrichment_flow.py` | 8 | Luồng đầy đủ (CSDL thật): upload → duyệt → chat → tổng hợp → xác nhận → đồng bộ profile |
| `test_cv_retention_skills.py` | — | US-45: giữ 12 tháng, gỡ kỹ năng khi xoá CV |
| `test_deepseek.py` | 8 | Client DeepSeek (JSON mode, retry, fallback) — dùng chung với AI Interview |

Chạy: `cd ai-service && pip install -r requirements-dev.txt && pytest -q tests`.

### 7.4 Kiểm thử e2e

| Script | Phạm vi |
| :---- | :---- |
| `scripts/e2e_acceptance.py` | Kiểm thử chấp nhận theo Definition of Done |
| `scripts/e2e_p0_auth_ai.py` | auth \+ AI (đăng ký, đăng nhập, refresh, CV upload) |
| `scripts/e2e_s2_cv.py` | CV upload → parse → enrichment → xác nhận goal |
| `scripts/eval/cv/run_eval.py` | Đánh giá CV parsing (Precision/Recall/F1) |

---

## 8\. Trả lời câu hỏi hội đồng

### auth-service

- *Vì sao dùng JWT thay vì session?* — Microservices: mỗi service tự xác minh token cục bộ, không cần lưu trạng thái phiên chung; access token ngắn (30 phút) \+ refresh token xoay vòng giữ an toàn.  
- *Refresh token xoay vòng là gì?* — Mỗi lần dùng refresh token, token cũ bị thu hồi và token mới được cấp. Dùng lại token đã thu hồi ⇒ thu hồi toàn bộ phiên (phát hiện đánh cắp).  
- *Nếu Redis chết thì sao?* — `LoginAttemptService` và `RateLimiter` tự fallback sang bộ đếm trong bộ nhớ (`ConcurrentHashMap`), service vẫn chạy.  
- *Vì sao không cho đăng ký admin?* — Admin tạo sẵn khi khởi động (`AdminSeeder`), tránh ai cũng tạo admin; quản lý qua biến môi trường.  
- *Audit log khác gì log thường?* — Append-only (trigger DB chặn sửa/xoá), có before/after, lưu 2 năm, dùng để truy vết hành động admin.

### learning-service

- *Vì sao % tiến độ tính theo tài liệu, không phải thời gian?* — Người dùng tự đánh dấu hoàn thành từng tài liệu; hệ thống không theo dõi thời gian xem (không có video tracking thật).  
- *Khoá bị xoá thì tiến độ sao?* — `ON DELETE CASCADE` xoá materials/enrollments/progress; roadmap\_items `course_id` → `SET NULL` (bước vẫn còn, chỉ mất liên kết).  
- *Vì sao dùng JDBC cho enrollment/completion?* — Bảng many-to-many đơn giản, `ON CONFLICT DO NOTHING` idempotent, không cần tạo entity riêng — ngắn gọn.

### CV Parsing \+ Chatbot

- *Vì sao cần chatbot khi đã có CV?* — CV mô tả quá khứ (đã làm gì), matching cần tương lai (muốn học gì). Chatbot lấp khoảng trống đó với số câu hỏi tối thiểu.  
- *Enrichment cải thiện matching như thế nào?* — Goal chi tiết \+ kỹ năng CV làm văn bản hồ sơ giàu ngữ nghĩa hơn → vector phân biệt tốt hơn, đồng thời bổ sung kỹ năng cho bước giải thích "Trùng kỹ năng".  
- *Parser rule-based bị nhầm thế nào?* — Phụ thuộc bố cục CV có tiêu đề mục rõ ràng; CV dạng bảng/2 cột phức tạp nên dùng engine DeepSeek. Từ điển kỹ năng cần mở rộng định kỳ.  
- *Mentor có xem được CV của bất kỳ mentee nào không?* — Không. ai-service hỏi mentoring-service xem có yêu cầu mentoring đang mở (PENDING/ACCEPTED) giữa hai người không; lỗi/chậm quá 3 giây ⇒ từ chối (*fail-closed*).  
- *Nếu DeepSeek chết giữa hội thoại?* — Lượt đó tự chuyển sang rule-based, hội thoại không bị gián đoạn. Engine chọn ở lượt đầu được lưu lại để cả buổi dùng nhất quán một engine.  
- *Người dùng không đồng ý gửi AI ngoài thì sao?* — `consentExternalAi = false` ⇒ chỉ rule-based cho CV đó (cả parse lẫn chatbot), không request nào tới DeepSeek. Kiểm tra lại ở mỗi lượt.  
- *Goal nháp vs xác nhận khác gì?* — Sau 4 lượt, goal ở trạng thái `DRAFT` (hồ sơ chưa đổi). Người dùng chọn "Dùng mục tiêu này" (`CONFIRMED`) mới gửi sang profile-service đúng một lần; "Bỏ qua" (`DISCARDED`) không gửi gì.  
- *Code nằm ở đâu?* — Toàn bộ ở ai-service (Python): đọc PDF, parse, chatbot, lưu file CV, hội thoại và điều phối luồng; dùng chung client DeepSeek và cơ chế fallback với AI Interview. profile-service vẫn là nơi duy nhất ghi hồ sơ — ai-service chỉ gọi `POST /api/profile/mentee/{id}/enrichment-chat`.