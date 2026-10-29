# Đặc tả API — MentorHub

> **v2.0 (21/10/2026)** — nội dung đánh dấu ⚒ là **mục tiêu theo bản chốt** [ban-chot-nghiep-vu.md](ban-chot-nghiep-vu.md), chưa hiện thực; phần không đánh dấu mô tả hệ thống hiện tại.


Bảng tra cứu toàn bộ endpoint của 7 service (100 endpoint nghiệp vụ, 107 kể cả `/health` — khớp số operation trong `contracts/*.yaml` và số route trong mã nguồn). Schema request/response đầy đủ nằm trong
`contracts/<service>.yaml` (OpenAPI 3.0.3) — có thể mở bằng <https://editor.swagger.io>.

## Quy ước chung

| Nội dung | Quy ước |
|---|---|
| Truy cập từ trình duyệt | Qua frontend: `http://localhost:3000/api/<service>/...` (proxy tới service) |
| Truy cập trực tiếp | `http://localhost:<port>/api/<service>/...` (8081 auth, 8082 profile, 8083 mentoring, 8084 payment, 8085 learning, 8090 matching, 8091 ai) |
| Xác thực | `Authorization: Bearer <accessToken>` |
| Nội bộ | `/internal/**` chỉ nhận header `X-Internal-Token: <INTERNAL_API_KEY>`; không đi qua frontend |
| Định dạng | JSON `camelCase`; thời gian ISO-8601 có offset (`2026-09-20T19:00:00+07:00`); tiền tệ VND |
| Lỗi | `{ "error": { "code": "STRING_CODE", "message": "Thông điệp tiếng Việt" } }` |
| Mã lỗi HTTP | 400 dữ liệu/quy tắc · 401 chưa đăng nhập · 403 không đủ quyền · 404 không tìm thấy · 409 xung đột trạng thái · 429 quá số lần thử · 502/503 service phụ thuộc lỗi |

Ký hiệu cột **Quyền**: `Public` không cần token · `Auth` mọi người dùng đăng nhập · `Mentee`, `Mentor`,
`Admin` theo role · `Owner` chủ tài nguyên (hoặc Admin) · `Internal` service nội bộ.

---

## 1. auth-service (8081) — Quang

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| POST | `/api/auth/register` | Public | Đăng ký `{email, password, role, fullName?, referralCode?}` → `AuthResponse` (201) | 1.1, 6.5 |
| POST | `/api/auth/login` | Public | Đăng nhập → `AuthResponse`; 401 sai thông tin, 403 bị khoá, 429 quá 5 lần sai | 1.2 |
| POST | `/api/auth/refresh` | Public | `{refreshToken}` → cặp token mới (xoay vòng) | 1.2 |
| POST | `/api/auth/logout` | Public | `{refreshToken}` → thu hồi (204) | 1.2 |
| GET | `/api/auth/verify-email?token=` | Public | Xác thực email | 1.1 |
| POST | `/api/auth/verify-token` | Public | `{token}` → `{valid, userId, role}` (kiểm tra cả trạng thái khoá) | 1.3 |
| GET | `/api/auth/me` | Auth | Thông tin tài khoản | 1.4 |
| PUT | `/api/auth/me` | Auth | `{fullName}` | 1.4 |
| POST | `/api/auth/me/change-password` | Auth | `{currentPassword, newPassword}` → 204, thu hồi mọi refresh token | 1.4 |
| GET | `/api/auth/admin/users?role=&q=&page=&size=` | Admin | Danh sách người dùng phân trang | 1.5 |
| GET | `/api/auth/admin/users/stats` | Admin | `{total, mentors, mentees}` | 1.5 |
| PATCH | `/api/auth/admin/users/{userId}/status` | Admin | `{status: ACTIVE\|LOCKED, reason?}` — v2.0: khoá bắt buộc `reason` ≥ 10 ký tự (400 `LOCK_REASON_REQUIRED`), ghi audit và gửi cho người bị khoá | 1.5 |

`AuthResponse = { userId, email, fullName, role, emailVerified, accessToken, refreshToken, expiresIn, referralApplied?, emailVerificationToken? }`

## 2. profile-service (8082) — Thảo

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| GET | `/api/profile/mentors?domain=&q=&page=&size=&includeUnverified=` | Auth | Duyệt mentor đã xác thực (admin xem được cả chưa duyệt) | 5.1 |
| GET | `/api/profile/mentor/{userId}` | Auth | Hồ sơ mentor kèm lịch rảnh và trạng thái xác thực | 2.4 |
| PUT | `/api/profile/mentor/{userId}` | Owner (Mentor) | Tạo/cập nhật hồ sơ; báo matching-service lập lại chỉ mục (bắn rồi quên) | 2.4, 2.5 |
| GET | `/api/profile/mentor/{userId}/availability` | Auth | Lịch rảnh hằng tuần | 2.4 |
| PUT | `/api/profile/mentor/{userId}/availability` | Owner (Mentor) | `{slots:[{dayOfWeek, startTime, endTime}]}` thay toàn bộ | 2.4 |
| GET | `/api/profile/mentee/{userId}` | Owner / Mentor / Admin | Hồ sơ mentee | 2.1–2.3 |
| PUT | `/api/profile/mentee/{userId}` | Owner (Mentee) | Tạo/cập nhật hồ sơ; báo matching-service lập lại chỉ mục (bắn rồi quên) | 2.1–2.3, 2.5 |
| POST | `/api/profile/mentee/{userId}/enrichment-chat` | Owner / Internal | `{enrichedGoalText, cvSkills?, cvFileUrl?}` → cập nhật goal, gộp kỹ năng | 8.5 |
| GET | `/internal/profile-summary/{userId}` | Internal | `{userId, displayName, role, domain}` | — |
| GET | `/internal/mentor/{userId}` | Internal | Hồ sơ mentor đầy đủ | — |
| PUT | `/internal/mentor/{userId}/verification` | Internal | `{status}` | 7.4, 7.5 |
| PUT | `/internal/mentor/{userId}/rating` | Internal | `{rating, ratingCount}` | 5.6 |
| PUT | `/internal/mentor/{userId}/active-mentees` | Internal | `{activeMenteeCount}` | 4.4 |
| DELETE | `/internal/profile/{userId}/cv-file?cvFileUrl=` | Internal | ai-service gọi sau khi xoá CV: gỡ `cv_file_url` của hồ sơ mentor/mentee **chỉ khi khớp chính xác** `cvFileUrl`; luôn 204; không lập lại chỉ mục embedding | 8.6 |

### 2.1 Bổ sung v2.0 (profile-service)

> **Cấp độ mentor và khung giá đã bị gỡ (D6, [design-mentor-verification.md](design-mentor-verification.md)):**
> `GET /api/profile/pricing-tiers`, `PUT /api/profile/mentor/{userId}/rate`, `PUT /internal/mentor/{id}/tier` không còn
> tồn tại. `PUT /internal/mentor/{id}/verification` chỉ còn nhận `{status}` (không còn `tier`). Mentor đặt `hourlyRate`
> tự do qua `PUT /api/profile/mentor/{userId}` (§2). Luồng xin nâng cấp AI Interview (`kind: UPGRADE`, `suggestedTier`,
> `fromTier`, `currentTier`, `upgradeAvailableAt`, 409 `UPGRADE_COOLDOWN`/`TIER_MAX`, 400 `TIER_NOT_HIGHER`) cũng đã gỡ.

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| PUT | `/api/profile/mentor/{userId}/trial` | Mentor (chủ hồ sơ) | `{enabled}` — bật/tắt nhận buổi trải nghiệm (mặc định bật) | 5.8 |

## 3. matching-service (8090) — Thảo

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | `{status, modelLoaded}` | — |
| POST | `/internal/embeddings/reindex` | Internal | `{userId, role?, force?}` → `{userId, role, status, indexedAt}`; profile-service gọi sau khi lưu hồ sơ và không chờ kết quả | 4.1, 2.5 |
| GET | `/api/matching/index-status?userId=` | Owner / Admin | `{userId, role, status, indexedAt}` — `UPDATED` khi vector khớp nội dung hồ sơ hiện tại | 2.5 |
| POST | `/api/matching/admin/embeddings/rebuild?force=` | Admin | Sinh embedding còn thiếu / sinh lại toàn bộ | 2.5 |
| GET | `/api/matching/mentors?menteeId=&limit=` | Owner (Mentee) / Admin | Danh sách mentor đã xếp hạng + thống kê pipeline; 404 `MENTEE_PROFILE_INCOMPLETE` | 4.3–4.6, 5.1 |

Ví dụ response:

```json
{
  "menteeId": "882e228b-6a76-451d-a0f7-25e6604ad20d",
  "mentors": [{
    "mentorId": "…", "displayName": "Nguyễn Hoàng Long", "domain": "backend",
    "skills": ["Java", "Spring Boot", "PostgreSQL", "Microservices", "System Design", "Kafka"],
    "similarityScore": 0.7756, "finalScore": 0.7729, "rating": 0.0, "ratingCount": 0,
    "yearsExperience": 9, "hourlyRate": 300000.0,
    "matchedSkills": ["Java", "System Design"],
    "reasons": ["Trùng kỹ năng: Java", "Có chuyên môn phù hợp mục tiêu của bạn: System Design",
                "Cùng lĩnh vực backend", "Hồ sơ rất tương đồng về nội dung (78%)", "9 năm kinh nghiệm"]
  }],
  "pipeline": { "k": 50, "retrieved": 7, "excluded": { "notVerified": 1, "domainMismatch": 3 },
                "returned": 3, "weights": { "similarity": 0.6, "rating": 0.15, "experience": 0.1,
                             "scheduleFit": 0.1, "responsiveness": 0.05 } }
}
```

## 4. learning-service (8085) — Quang

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| GET | `/api/learning/courses?domain=&q=` | Auth | Danh sách khoá học (kèm đã đăng ký, % hoàn thành) | 3.1 |
| GET | `/api/learning/me/courses` | Auth | Khoá học đã đăng ký | 3.3 |
| GET | `/api/learning/courses/{id}` | Auth | Chi tiết khoá + tài liệu + trạng thái hoàn thành | 3.1 |
| POST | `/api/learning/courses/{id}/enroll` | Auth | Đăng ký học | 3.3 |
| DELETE | `/api/learning/courses/{id}/enroll` | Auth | Huỷ đăng ký | 3.3 |
| GET | `/api/learning/courses/{courseId}/progress/{userId}` | Owner | `{courseId, userId, percentComplete}` | 3.3 |
| POST / DELETE | `/api/learning/materials/{id}/complete` | Auth | Đánh dấu / bỏ đánh dấu hoàn thành tài liệu | 3.3 |
| GET | `/api/learning/roadmaps` | Auth | Danh sách roadmap | 3.2 |
| GET | `/api/learning/roadmaps/{id}` | Auth | Chi tiết roadmap + tiến độ | 3.2 |
| POST / DELETE | `/api/learning/roadmap-items/{id}/complete` | Auth | Đánh dấu / bỏ đánh dấu bước roadmap | 3.3 |
| POST | `/api/learning/admin/courses` | Admin | Tạo khoá học | 3.4 |
| PUT / DELETE | `/api/learning/admin/courses/{id}` | Admin | Sửa / xoá khoá học | 3.4 |
| POST | `/api/learning/admin/courses/{id}/materials` | Admin | Thêm tài liệu | 3.4 |
| PUT / DELETE | `/api/learning/admin/materials/{id}` | Admin | Sửa / xoá tài liệu | 3.4 |
| POST | `/api/learning/admin/roadmaps` | Admin | Tạo roadmap | 3.4 |
| PUT / DELETE | `/api/learning/admin/roadmaps/{id}` | Admin | Sửa / xoá roadmap | 3.4 |
| POST | `/api/learning/admin/roadmaps/{id}/items` | Admin | Thêm bước | 3.4 |
| PUT / DELETE | `/api/learning/admin/roadmap-items/{id}` | Admin | Sửa / xoá bước | 3.4 |

## 5. mentoring-service (8083) — Thắng

### 5.1 Yêu cầu mentoring, phiên, tranh chấp, đánh giá

> Đồng bộ với code ngày 29/10/2026. Hành vi từng luồng, thứ tự kiểm tra và ngưỡng: [spec-mentoring-service.md](spec-mentoring-service.md); hợp đồng chi tiết: `contracts/mentoring-service.yaml`.
> Tiền tố `/api/mentoring`. "Người tham gia" = mentee hoặc mentor của phiên (admin được phép ở các endpoint ghi chú "+ Admin").

**Yêu cầu mentoring (F1)**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| GET | `/requests` | Auth | Yêu cầu của tôi (mentor: gửi tới; mentee: đã gửi; admin: tất cả) | 5.2 |
| POST | `/requests` | Mentee | Gửi yêu cầu: `{mentorId, goal 50–1000 ký tự, sessionType, frequency, expectedDurationMonths 1\|3\|6, message?}` (201); 403 `EMAIL_NOT_VERIFIED`; 400 `INVALID_GOAL` / `MENTOR_NOT_VERIFIED` / `MENTOR_UNAVAILABLE`; 409 `REQUEST_ALREADY_EXISTS` / `TOO_MANY_PENDING_REQUESTS` | 5.2 |
| POST | `/requests/{id}/respond` | Mentor + Admin | `{decision: ACCEPT\|REJECT, rejectReason? (bắt buộc khi REJECT), note?}`; 409 `CAPACITY_FULL` / `REQUEST_NOT_PENDING` | 5.3 |
| POST | `/requests/{id}/cancel` | Mentee + Admin | Huỷ yêu cầu `PENDING` (409 `REQUEST_NOT_PENDING`) | 5.2 |
| POST | `/requests/{id}/end` | Người tham gia + Admin | Kết thúc quan hệ `ACCEPTED → ENDED`: `{reason: GOAL_REACHED\|NO_LONGER_NEEDED\|NOT_A_FIT\|OTHER, note?}`; huỷ các phiên sắp tới theo chính sách huỷ của người kết thúc. Endpoint cũ `/requests/{id}/complete` đã gỡ | 5.3 |

**Đặt lịch, xác nhận, buổi thử (F2–F4)**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/mentors/{id}/available-slots?durationMinutes=&days=&excludeSessionId=` | Auth | Khung giờ còn đặt được (bước 30 phút; `durationMinutes` 60 hoặc 15; `days` 1–28): trong lịch rảnh, trừ phiên đang giữ chỗ (`PENDING` / `AWAITING_MENTOR` / `CONFIRMED`, có đệm) và đề xuất đổi lịch đang chờ của mentor và của người gọi → `{timezone, durationMinutes, price, slots:[{startAt, endAt}]}`. `excludeSessionId` chỉ có hiệu lực với participant của phiên đó (dùng khi đổi lịch) | 5.4 |
| POST | `/sessions` | Mentee + Admin | Đặt lịch (201): `{menteeId, mentorId, scheduledAt, sessionType, agenda 20–500, durationMinutes?, preReadLink?, topic?, referralCode?, kind?, mockIntake?}`. Buổi thường 60 phút cần yêu cầu `ACCEPTED` (400 `NOT_ACCEPTED`); giá = giá mentor, chốt lúc đặt (409 `PRICE_NOT_SET`). Tạo `PENDING` rồi tạm giữ học phí từ ví → `AWAITING_MENTOR` (ví thiếu: giữ `PENDING` 15 phút). Lỗi khác: 400 `INVALID_DURATION` / `INVALID_AGENDA` / `TOO_SOON` / `TOO_FAR`; 409 `MENTOR_NOT_AVAILABLE` / `MENTEE_SCHEDULE_CONFLICT` / `MENTOR_ON_LEAVE` / `MENTOR_SUSPENDED` / `TOO_MANY_UNPAID_SESSIONS` (tối đa 2 phiên `PENDING` mỗi mentee). `kind: TRIAL` = buổi thử 15 phút, 30.000đ, không cần quan hệ: 409 `TRIAL_NOT_ALLOWED` (cặp đã có yêu cầu `ACCEPTED` / `ENDED`) / `TRIAL_DISABLED` / `MENTOR_PAUSED` / `TRIAL_ALREADY_USED` / `TRIAL_LIMIT`. `referralCode` chỉ ở buổi thường đầu tiên (400 `REFERRAL_NOT_FIRST_BOOKING` …). `mockIntake` bắt buộc khi `sessionType = MOCK_INTERVIEW` | 5.4, 5.8, 6.5 |
| GET | `/sessions?status=` | Auth | Lịch sử phiên | 5.7 |
| GET | `/sessions/{id}` | Người tham gia + Admin | Chi tiết phiên | 5.7 |
| POST | `/sessions/{id}/confirm` | Mentor + Admin | `AWAITING_MENTOR → CONFIRMED`; 409 `NOT_AWAITING_MENTOR` / `CONFIRM_WINDOW_CLOSED` | 5.4 |
| POST | `/sessions/{id}/decline` | Mentor + Admin | `{reason?}` — từ chối buổi chờ xác nhận: hoàn 100% (qua outbox), không lỗi vi phạm, trả lượt buổi thử | 5.4 |
| PUT | `/sessions/{id}/meeting-link` | Mentor + Admin | Đặt link họp ngoài (`https` Meet / Zoom / Teams): 400 `INVALID_MEETING_LINK`; 409 `SESSION_NOT_EDITABLE` | — |
| GET | `/sessions/{id}/calendar.ics` | Người tham gia | Xuất lịch (`SEQUENCE` tăng sau mỗi lần dời) | — |

**Phòng học và tham dự (F5–F6)**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/sessions/{id}/room` | Mentee, Mentor (không Admin) | `{provider:"jitsi", roomName, domain, jwt, opensAt, closesAt, graceMinutes, moderator}`; chỉ `CONFIRMED` / `AWAITING_ATTENDANCE`, từ 10 phút trước giờ bắt đầu tới 30 phút sau giờ kết thúc (409 `ROOM_NOT_AVAILABLE` / `ROOM_CLOSED`). Lần đầu mỗi bên **ghi nhật ký vào phòng** và đóng đề xuất đổi lịch đang chờ | 5.9, 5.10 |
| POST | `/sessions/{id}/report-absent` | Người tham gia | Báo bên kia vắng: sau thời gian chờ (10 phút; buổi thử 5 phút), mình đã vào phòng, bên kia chưa — 409 `GRACE_NOT_ELAPSED` / `YOU_NOT_JOINED` / `OTHER_SIDE_JOINED`. Không đổi trạng thái phiên | 5.10 |
| POST | `/sessions/{id}/attendance` | Người tham gia | `{answer: HELD\|MENTOR_NO_SHOW\|MENTEE_NO_SHOW\|CANCELLED_ON_CALL}` trong 24 giờ sau giờ kết thúc; 409 `ABSENCE_CONTRADICTS_LOG` / `ATTENDANCE_NOT_OPEN` / `ATTENDANCE_CLOSED` / `ATTENDANCE_WINDOW_CLOSED` / `ATTENDANCE_ALREADY_ANSWERED`. Hai bên khác nhau → `DISPUTED` | 5.10 |
| POST | `/sessions/{id}/complete` | Mentor + Admin | Tương đương mentor trả lời `HELD` | 5.6 |

**Huỷ và đổi lịch (F7–F8)**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/sessions/{id}/cancel-preview` | Người tham gia + Admin | Xem trước `refundPercent`, `refundAmount`, văn bản chính sách | 5.11 |
| POST | `/sessions/{id}/cancel` | Người tham gia + Admin | `{reason?}` — huỷ `PENDING` / `AWAITING_MENTOR` / `CONFIRMED` chưa bắt đầu (409 `SESSION_NOT_CANCELLABLE` / `SESSION_ALREADY_STARTED`). Hoàn tiền theo bậc 24h / 4h (buổi thử 2h) qua outbox, không còn lỗi `REFUND_FAILED`. Mentor huỷ buổi `CONFIRMED` → 1 lỗi vi phạm | 5.11 |
| POST | `/sessions/{id}/reschedule` | Mentee, Mentor | `{newStart}` (201): chỉ `CONFIRMED`, bất kỳ lúc nào trước giờ bắt đầu hiện tại; 409 `SESSION_NOT_CONFIRMED` / `RESCHEDULE_TOO_LATE` / `SESSION_ALREADY_JOINED` / `RESCHEDULE_LIMIT` (2 lần) / `RESCHEDULE_PENDING` / `MENTOR_NOT_AVAILABLE` / `MENTEE_SCHEDULE_CONFLICT`; 400 `SAME_START` / `TOO_SOON` / `TOO_FAR` | — |
| POST | `/reschedules/{id}/accept` | Mentee, Mentor (bên không đề xuất) | Chấp nhận, trả phiên đã cập nhật; 409 `RESCHEDULE_NOT_PENDING` / `RESCHEDULE_EXPIRED` / `SESSION_NOT_CONFIRMED` / `RESCHEDULE_TOO_LATE` / `SESSION_ALREADY_JOINED` / `RESCHEDULE_START_PASSED` (các lỗi này đóng đề xuất) / `MENTOR_SUSPENDED` / `MENTOR_ON_LEAVE` | — |
| POST | `/reschedules/{id}/decline` | Mentee, Mentor | Bên nhận từ chối hoặc người đề xuất rút lại | — |

**Tranh chấp (F6)**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| POST | `/sessions/{id}/disputes` | Mentee, Mentor | `{type, description 20–2000, evidenceLinks ≤ 5}` (201), trong 72 giờ sau giờ kết thúc; 409 `DISPUTE_ALREADY_OPEN` / `DISPUTE_NOT_ALLOWED` / `DISPUTE_WINDOW_CLOSED`. Phiên có phí → giao dịch `ON_HOLD` | — |
| GET | `/sessions/{id}/disputes` | Người tham gia + Admin | Tranh chấp của phiên | — |
| GET | `/admin/disputes?status=` · `/admin/disputes/{id}` | Admin | Danh sách (`ACTIVE` = `OPEN` + `IN_REVIEW`) và chi tiết | — |
| POST | `/admin/disputes/{id}/start-review` | Admin | `OPEN → IN_REVIEW` | — |
| POST | `/admin/disputes/{id}/resolve` | Admin | `{outcome: FULL_REFUND\|PARTIAL_REFUND\|NO_REFUND\|WARNING\|SUSPEND, refundPercent? (1–99, chỉ PARTIAL_REFUND), note}`; phiên treo → `CANCELLED` (hoàn đủ / đình chỉ) hoặc `COMPLETED` | — |

**Đánh giá (F6)**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| POST | `/sessions/{id}/review` | Mentee | Đánh giá có cấu trúc (201): `{rating, knowledge, clarity, preparation (1–5), comment?, tags?}`; chỉ phiên `COMPLETED` trong 14 ngày; 409 `SESSION_NOT_COMPLETED` / `SESSION_REFUNDED` (đã hoàn 100%) / `TRIAL_NOT_REVIEWABLE` / `REVIEW_WINDOW_CLOSED` / `ALREADY_REVIEWED`; 400 `COMMENT_REQUIRED` (rating ≤ 2 cần bình luận ≥ 20 ký tự) | 5.6 |
| PUT | `/sessions/{id}/review` | Mentee | Sửa trong 48 giờ sau khi đăng (409 `REVIEW_EDIT_WINDOW_CLOSED`) | 5.6 |
| POST | `/reviews/{reviewId}/reply` | Mentor | Phản hồi một lần, ≤ 500 ký tự (409 `ALREADY_REPLIED`) | 5.6 |
| POST | `/sessions/{id}/mentee-feedback` | Mentor | Nhận xét riêng về mentee (chuẩn bị, tham gia 1–5) | — |
| GET | `/mentors/{id}/reviews` · `/mentors/{id}/review-summary` · `/mentees/{id}/reliability` | Auth | Đánh giá công khai, tổng hợp, huy hiệu tin cậy của mentee | 5.6 |

**Khác**

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/notifications?limit=` | Auth | `{unreadCount, items}` | 5.5 |
| POST | `/notifications/{id}/read` · `/notifications/read-all` | Auth | Đánh dấu đã đọc | 5.5 |
| GET | `/admin/stats` | Admin | `{pendingSessions, confirmedSessions, completedSessions, cancelledSessions}` | — |
| GET | `/sessions/{id}/mock` · PUT `/sessions/{id}/scorecard` · GET `/mock-interviews/history` | Người tham gia | Phỏng vấn thử với mentor (US-58): intake, phiếu đánh giá, lịch sử | — |

Tin nhắn luôn che số điện thoại, email, đường dẫn ngoài và tài khoản mạng xã hội (`contactsMasked = true`); mỗi lần che ghi vào `contact_violations`, ≥ 3 lần / 30 ngày → thông báo admin (FR-5.12). Admin xem gộp theo người gửi: `GET /api/mentoring/admin/contact-violations?days=30` → `[{userId, userName, count, kinds, lastAt, flagged}]` (trang `/admin/contact-violations`).

### 5.2 Nội bộ

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/internal/sessions/{id}` | Internal | `{id, menteeId, mentorId, scheduledAt, durationMinutes, price, status}` |
| POST | `/internal/sessions/{id}/payment-succeeded` | Internal | `{transactionId}` → `PENDING → AWAITING_MENTOR` (FR-6.2). Idempotent theo `transactionId` (lưu ở `sessions.payment_transaction_id`); tiền về sau khi phiên đã huỷ / hết hạn → xếp hoàn 100% vào outbox một lần. payment-service gọi lại mỗi phút tới khi thành công |
| POST | `/internal/mentors/{mentorId}/suspend` | Internal | Đình chỉ mentor: huỷ mọi phiên sắp tới `PENDING` / `AWAITING_MENTOR` / `CONFIRMED` (hoàn 100%, không lỗi vi phạm); 502 `SUSPEND_INCOMPLETE` nếu còn phiên lỗi |
| POST | `/internal/rooms/token` | Internal (ai-service) | Ký JWT Jitsi cho phòng phỏng vấn xác thực mentor |
| POST | `/internal/notifications` | Internal | `{recipientId? , recipientRole?, type, title, message, link?}` → tạo thông báo (ai-service gọi) |
| POST | `/internal/accounts/{userId}/lock` | Internal (auth-service) | `{locked, actorId?, reason?}` — khoá: huỷ buổi chưa diễn ra (hoàn 100%) + đóng băng ví; khoá mentor: mở tranh chấp hệ thống giữ thu nhập đang chờ của buổi đã học; báo người bị khoá (`ACCOUNT_LOCKED` / `ACCOUNT_UNLOCKED`). Trả `{cancelledSessions, heldEarnings, failed}`. Idempotent (FR-6.10) |
| GET | `/internal/relationships?mentorId=&menteeId=` | Internal | `{mentorId, menteeId, related}` — `related = true` khi có yêu cầu mentoring của mentee gửi mentor ở trạng thái `PENDING` hoặc `ACCEPTED` (ai-service dùng để quyết định mentor có được tải CV) |

## 6. payment-service (8084) — Thắng

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| POST | `/api/payment/charge` | Mentee | `{sessionId, amount?, card:{cardNumber, cardHolder?, expiry, cvv}}` → `Transaction` | 6.1–6.3 |
| GET | `/api/payment/transactions` | Auth | Giao dịch của tôi | 6.3 |
| GET | `/api/payment/transactions/{id}` | Người trả / mentor / Admin | Chi tiết | 6.3 |
| GET | `/api/payment/sessions/{sessionId}/transactions` | Người trả / mentor / Admin | Lịch sử giao dịch của phiên | 6.3 |
| GET | `/api/payment/referrals/me` | Auth | v2.0: các mã **theo mentor** của tôi + danh sách lượt giới thiệu (`REGISTERED` / `QUALIFIED` / `UNDER_REVIEW` / `REJECTED`, `rewardAmount`) | 6.4–6.6 |
| POST | `/api/payment/referrals/codes` | Mentee | `{mentorId}` → `{code, mentorId}` (mỗi cặp một mã, gọi lại trả cùng mã); 409 `REFERRAL_NOT_ELIGIBLE` khi chưa hoàn thành buổi thường đã trả nào với mentor | 6.4 |
| GET | `/api/payment/admin/transactions?status=&page=&size=` | Admin | Giám sát giao dịch | 6.3 |
| GET | `/api/payment/admin/stats` | Admin | `{successCount, failedCount, refundedCount, totalRevenue}` | 6.3 |
| GET | `/api/payment/admin/referrals` | Admin | Giám sát referral (v1.x) | 6.6 |
| GET | `/api/payment/admin/mentor-referrals?status=` | Admin | Lượt giới thiệu theo mentor (lọc `UNDER_REVIEW`) | 6.6 |
| POST | `/api/payment/admin/mentor-referrals/{id}/decide` | Admin | `{decision: APPROVE\|REJECT, reason}` | 6.6 |
| POST | `/internal/referrals/validate` | Internal (mentoring) | `{code, refereeId, mentorId}` — kiểm mã trước khi tạo buổi; 400 kèm mã lỗi cụ thể | 6.5 |
| POST | `/internal/referrals/apply` | Internal (mentoring) | `{code, refereeId, mentorId, sessionId}` — ghi nhận lượt `REGISTERED` | 6.5 |
| POST | `/internal/referrals` | Internal | v1.x: `{code, refereeId}` lúc đăng ký (auth-service) — mã theo người dùng cũ không còn được cấp | 6.5 |
| POST | `/internal/payments/refund` | Internal | `{sessionId, reason?}` (mentoring-service gọi) | 6.3 |

### 6.1 Ví *(v2.0 — chi tiết trong `contracts/payment-service.yaml`)*

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/api/payment/wallet` | Auth | `{status, cash, promo, held, frozen, nextPromoExpiry}` | 6.1 |
| GET | `/api/payment/wallet/entries?kind=&page=` | Auth | Lịch sử bút toán | 6.1 |
| POST | `/api/payment/wallet/topups` | Mentee | `{amount, provider, card?}` (50.000–5.000.000; 409 `CASH_CAP_EXCEEDED`) — `SANDBOX` + `card` trả kết quả ngay, `MOMO`/`VNPAY` trả URL chuyển hướng (IPN/đối soát như US-56); 403 `EMAIL_NOT_VERIFIED` | 6.1 |
| POST | `/api/payment/wallet/reactivate` | Mentee | Kích hoạt lại ví `DORMANT` | 6.8 |
| GET | `/api/payment/wallet/topup-refund/eligibility` | Mentee | `{maxAmount, windowEndsAt, remainingRequests}` | 6.7 |
| POST | `/api/payment/wallet/topup-refund` | Mentee | `{amount}` — 409 `REFUND_WINDOW_CLOSED`, `REFUND_AMOUNT_EXCEEDED`, `REFUND_LIMIT_REACHED` | 6.7 |
| GET | `/api/payment/wallet/admin/topup-refunds?status=` | Admin | Hàng chờ ngoại lệ | 6.7 |
| POST | `/api/payment/wallet/admin/topup-refunds/{id}/decide` | Admin | `{decision: APPROVE\|REJECT, reason}` | 6.7 |
| POST | `/api/payment/wallet/admin/{userId}/promo` | Admin | `{amount, reason}` cấp khuyến mãi (lô hết hạn 12 tháng) | 6.8 |
| POST | `/api/payment/wallet/pay` | Mentee | `{sessionId, amount?}` — trả học phí phiên PENDING từ ví (khuyến mãi trước); 402 `INSUFFICIENT_FUNDS`; phiên chuyển AWAITING_MENTOR | 6.2 |
| POST | `/internal/wallet/pay` | Internal (mentoring) | `{userId, sessionId}` — tạm giữ ngay sau khi đặt lịch; 402 `INSUFFICIENT_FUNDS` | 6.2 |
| POST | `/internal/payments/refund` | Internal | `{sessionId, percent?, amount?, reason?}` — giao dịch WALLET hoàn về ví đúng nguồn (khuyến mãi / tiền nạp) | 6.3 |
| POST | `/internal/wallet/freeze` | Internal | `{userId, frozen}` (admin khoá/mở khoá) | 6.10 |
| GET | `/internal/earnings/pending-sessions?mentorId=` | Internal (mentoring) | Các buổi của mentor còn thu nhập đang chờ — dùng khi khoá mentor | 6.10 |

`POST /api/payment/charge` (trả trực tiếp từng phiên) bị tắt mặc định (409 `USE_WALLET`): học phí chỉ trả từ ví (`/wallet/pay`, hoặc mentoring tự gọi `/internal/wallet/pay` ngay sau khi đặt lịch).
Mã giới thiệu được dùng qua trường `referralCode` của `POST /api/mentoring/sessions` (mentoring gọi `/internal/referrals/validate` rồi `/apply`).

**Thẻ test của cổng sandbox**

| Số thẻ | Kết quả |
|---|---|
| `4242 4242 4242 4242` | SUCCESS |
| `4000 0000 0000 0002` | FAILED — `CARD_DECLINED` |
| `4000 0000 0000 9995` | FAILED — `INSUFFICIENT_FUNDS` |
| Số sai Luhn / CVV sai / hết hạn | FAILED — `INVALID_CARD_NUMBER` / `INVALID_CVV` / `CARD_EXPIRED` |

## 7. ai-service (8091) — Thắng (`interview`), Quang (`cv`, `enrichment`)

ai-service sở hữu trọn vẹn 3 tính năng AI (luồng nghiệp vụ + dữ liệu trong `ai_db`). `/api/ai/**` yêu cầu
JWT như các service khác và đi qua proxy của frontend. Mọi bản ghi có `engine` (`DEEPSEEK` | `RULE_BASED`)
— engine chọn ở lượt đầu được lưu lại để cả buổi dùng nhất quán một engine; DeepSeek lỗi ở một lượt thì
lượt đó tự dùng rule-based.

### 7.1 AI Interview

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | `{status, dbConnected, llmEnabled, llmProvider, model}` | — |
| ~~POST~~ | ~~`/api/ai/interviews`~~ | Mentor | **Đã gỡ ở PR 1b (D1/D10)** — luồng chat bỏ; bắt đầu phỏng vấn bằng `POST /api/ai/interviews/voice` | 7.1 |
| GET | `/api/ai/interviews/me` | Mentor | Buổi gần nhất (204 nếu chưa có) | 7.1 |
| GET | `/api/ai/interviews/{id}` | Owner / Admin | Chi tiết | 7.4 |
| ~~POST~~ | ~~`/api/ai/interviews/{id}/answers`~~ | Mentor | **Đã gỡ ở PR 1b (D1/D10)** — nộp bản chép lời qua `/voice-transcript` | 7.2–7.4 |
| GET | `/api/ai/verification/status` | Mentor | ⚒ PR 2 — `{applicationId, status, attemptsUsed, attemptsLeft, maxAttempts (2), retakeCount, retakeLimit (2), retryAfter, canStart, reason: null\|IN_PROGRESS\|PENDING_REVIEW\|ALREADY_APPROVED\|COOLDOWN, voiceAvailable}`; thay `GET /api/ai/interviews/eligibility` | 7.1 |
| PUT | `/api/ai/verification/videos/{interviewId}/chunks/{n}?startMs&durMs` | Mentor (chủ buổi) | ⚒ PR 3 — thân nhị phân một đoạn video (≤ 8 MB); cùng `n` thì thay. 413 `CHUNK_TOO_LARGE`, 409 `VIDEO_FINISHED` | 7.7 |
| PUT | `/api/ai/verification/videos/{interviewId}/audio-chunks/{n}?startMs&durMs` | Mentor (chủ buổi) | ⚒ PR 3 — đoạn của luồng chỉ âm thanh (cho server chép lời lại) | 7.7 |
| POST | `/api/ai/verification/videos/{interviewId}/finish` | Mentor (chủ buổi) | ⚒ PR 3 — chốt video: ghép đoạn, cờ `CAMERA_OFF`, chép lời lại + so sánh (`TRANSCRIPT_MISMATCH`); đủ cả bản chép lời và video thì đợt sang `ROUND1_REVIEW` và báo admin. Mất camera > 60 giây tổng cộng → lần làm `INVALIDATED` | 7.7 |
| POST | `/api/ai/verification/videos/{interviewId}/play-token` | Mentor (chủ buổi) / Admin | ⚒ PR 3 — `{url, expiresAt}`: link phát có token 10 phút; admin lấy token ghi audit `VIDEO_VIEWED` | 7.7 |
| GET | `/api/ai/verification/videos/{interviewId}/stream?token=` | Token | ⚒ PR 3 — phát video, hỗ trợ `Range` (200/206); 410 `VIDEO_DELETED` | 7.7 |
| DELETE | `/api/ai/admin/verification/videos/{interviewId}` | Admin | ⚒ PR 3 — xoá file vĩnh viễn, giữ cờ và hai bản chép lời; audit `VIDEO_DELETED` | 7.7 |
| POST | `/api/ai/verification/applications` | Mentor | ⚒ PR 2 — mở đợt xác thực (idempotent); `POST /interviews/voice` cũng tự mở. 409 `INTERVIEW_COOLDOWN` (kèm `retryAfter`, chờ 15 ngày) \| `INTERVIEW_PENDING_REVIEW` \| `ALREADY_APPROVED` | 7.1 |
| POST | `/api/ai/admin/verification/applications/{id}/slots` | Admin | ⚒ PR 4 — `{startsAt: ISO[]}` (1..3 khung, chỉ giờ bắt đầu, cách hiện tại ≥ 60 phút); 409 `CHOICE_PENDING` khi mentor chưa chọn và chưa hết hạn; `warnings` nếu admin đã có buổi khác trong 60 phút | 7.5 |
| POST | `/api/ai/verification/slots/{id}/choose` | Mentor | ⚒ PR 4 — chọn khung giờ (trong 3 ngày) → `ROUND2_SCHEDULED`; 409 `CHOICE_EXPIRED` / `SLOT_NOT_AVAILABLE` | 7.5 |
| POST | `/api/ai/verification/round2/reschedule` | Mentor | ⚒ PR 4 — đổi giờ: ≤ 2 lần, báo trước ≥ 24 giờ (409 `RESCHEDULE_LIMIT` / `RESCHEDULE_TOO_LATE`) | 7.5 |
| GET | `/api/ai/verification/round2/room[?applicationId=]` | Mentor / Admin | ⚒ PR 4 — token phòng Jitsi (admin = moderator, cần `applicationId`); chỉ trong khung giờ phòng mở (409 `ROOM_CLOSED`), ghi nhật ký vào phòng | 7.5 |
| POST | `/api/ai/admin/verification/applications/{id}/mentor-absent` | Admin | ⚒ PR 4 — báo vắng: sau 10 phút chờ và nhật ký vào phòng không có mentor; lần 2 đóng đợt | 7.5 |
| POST | `/api/ai/admin/verification/applications/{id}/decision` | Admin | ⚒ PR 4 — `{decision: APPROVE\|REJECT\|RESCHEDULE, scores{5 tiêu chí 0–10}, scoreNotes, note}`; tiêu chí ≤ 2 hoặc ≥ 9 cần lý do (400 `SCORE_NOTE_REQUIRED`); ngược khuyến nghị cần note | 7.5 |
| POST | `/internal/rooms/token` | Nội bộ (mentoring-service) | ⚒ PR 4 — ai-service xin JWT Jitsi cho phòng `mentorhub-verify-<32 hex>` (ADR-08) | 7.5 |
| GET | `/api/ai/admin/verification/applications?status=` | Admin | ⚒ PR 2 — danh sách đợt (kèm buổi vòng 1 mới nhất: điểm, khuyến nghị, cờ) | 7.5 |
| GET | `/api/ai/admin/verification/applications/{id}` | Admin | ⚒ PR 2 — chi tiết đợt: mọi lần làm vòng 1 | 7.5 |
| POST | `/api/ai/admin/verification/applications/{id}/round1-review` | Admin | ⚒ PR 2 — `{decision: PASS\|REJECT\|RETAKE, note?}` → đồng bộ trạng thái xác thực sang profile-service. `RETAKE` không tính vào số lần làm, tối đa 2 lần (409 `RETAKE_LIMIT_REACHED`); ghi chú ≥ 10 ký tự khi `RETAKE` hoặc ngược khuyến nghị AI (400 `REVIEW_NOTE_REQUIRED`). `PASS` → sang vòng 2 (`ROUND2_PENDING_SLOTS`). Thay `POST /admin/interviews/{id}/review`, bỏ `unlock` | 7.5 |
| GET | `/api/ai/admin/stats` | Admin | `{interviewsInProgress, interviewsPendingReview, mentorsApproved, mentorsRejected}` | — |
| POST | `/api/ai/interviews/voice` | Mentor | ⚒ v2.1 — `{selfAnswerAcknowledged: true, consentExternalAi: true, consentVideo: true}` (PR 3: thiếu `consentVideo` → 400 `VIDEO_CONSENT_REQUIRED`) → `{interview: InterviewView, voice: {clientSecret, expiresAt, model, topics}}`. Kiểm tra điều kiện (`SELF_ANSWER_ACK_REQUIRED`, `PROFILE_REQUIRED`, `INTERVIEW_PENDING_REVIEW`, chờ / khoá / nâng cấp); 400 `VOICE_CONSENT_REQUIRED`. Tạo buổi `IN_PROGRESS`, `mode = VOICE`, `max_turns` = số chủ đề, `plan` = kế hoạch câu hỏi AI soạn (admin xem qua `GET /api/ai/interviews/{id}` → `plan[{name, question, source: BANK\|CV\|GOAL\|AI}]`). Đang có buổi giọng nói < 30 phút → trả lại buổi đó (đúng kế hoạch cũ) kèm client secret mới. Thiếu `OPENAI_API_KEY`: production 503 `VOICE_UNAVAILABLE` (không tạo gì), ngoài production `voice: null`; OpenAI lỗi → 502 `VOICE_UNAVAILABLE`. `GET /api/ai/interviews/eligibility` thêm `voiceAvailable` | 7.7 |
| POST | `/api/ai/interviews/{id}/voice-transcript` | Mentor (Owner) | ⚒ v2.1 — `{items: TranscriptItem[]}` (`{role: marker\|assistant\|user, text?, topicNo?}`); chỉ buổi `IN_PROGRESS`, `mode = VOICE`. Gộp theo chủ đề → mỗi chủ đề một `interview_turns`, chấm bằng engine + rubric hiện có, rồi như hoàn thành chat: `PENDING_REVIEW`, đồng bộ xác thực (bỏ qua với `UPGRADE`), thông báo admin + mentor. 400 `EMPTY_TRANSCRIPT` nếu chưa hỏi chủ đề nào; 409 `INTERVIEW_NOT_VOICE` (buổi chat), `INTERVIEW_ABANDONED`, `INTERVIEW_NOT_IN_PROGRESS` (gửi lần hai) | 7.7 |

Route thử nghiệm `POST /api/ai/voice-interviews/session` và `POST /api/ai/voice-interviews/grade` (và trang `/interview/voice`)
**đã gỡ ở v2.1**, thay bằng hai endpoint trên và lựa chọn "giọng nói" trên `/interview`.

### 7.1b Luyện phỏng vấn với AI *(v2.1 ⚒ — mentee)*

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/api/ai/practice-interviews/eligibility` | Mentee | `{freeLimit: 1, used: 0\|1, canStart, reason: null\|PRACTICE_FREE_USED\|IN_PROGRESS, inProgressId, voiceAvailable}` | 10.1 |
| POST | `/api/ai/practice-interviews` | Mentee | `{interviewType, level, targetRole, targetCompany?, consentExternalAi: true}` → `{practice: PracticeView, voice: {clientSecret, expiresAt, model, topics}}`. `interviewType` ∈ BACKEND/FRONTEND/SYSTEM_DESIGN/BEHAVIORAL, `level` ∈ INTERN/FRESHER/JUNIOR, `targetRole` 2–120 ký tự, `targetCompany` ≤ 120. AI soạn kế hoạch câu hỏi từ intake + mục tiêu + CV đã xác nhận (đồng ý gửi AI bên ngoài), lưu `plan`; `PracticeView.plan` chỉ hiện khi buổi không còn `IN_PROGRESS`. Buổi `IN_PROGRESS` < 30 phút → trả lại buổi đó (đúng kế hoạch cũ) kèm client secret mới. 409 `PRACTICE_FREE_USED` (kèm `ctaLabel` "Đặt phỏng vấn thử với mentor", `ctaHref` `/matching`); 400 `VOICE_CONSENT_REQUIRED`; thiếu `OPENAI_API_KEY` như trên (503 `VOICE_UNAVAILABLE` / `voice: null`) | 10.1–10.3 |
| POST | `/api/ai/practice-interviews/{id}/complete` | Mentee (Owner) | `{items: TranscriptItem[]}` → `PracticeView` có `result` (nhận xét từng câu, 3 điểm mạnh, 3 điểm cần cải thiện, điểm 0–100, báo cáo nói); chỉ buổi `IN_PROGRESS`. 400 `EMPTY_TRANSCRIPT`; 404 `PRACTICE_NOT_FOUND`; 409 `PRACTICE_NOT_IN_PROGRESS` | 10.4–10.6 |
| GET | `/api/ai/practice-interviews/me` | Mentee | Danh sách buổi luyện của mình, mới nhất trước | 10.7 |
| GET | `/api/ai/practice-interviews/{id}` | Owner / Admin | Chi tiết một buổi luyện | 10.7 |

### 7.2 CV Parsing + Chatbot enrichment

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| POST | `/api/ai/mentee/{id}/cv-upload` | Owner (Mentee) | `multipart/form-data: file` → `{cv, conversation}` | 8.1–8.3 |
| GET | `/api/ai/mentee/{id}/enrichment/latest` | Owner | CV + hội thoại gần nhất (204 nếu chưa có) | 8.3 |
| GET | `/api/ai/enrichment/conversations/{id}` | Owner | Chi tiết hội thoại | 8.3 |
| POST | `/api/ai/enrichment/conversations/{id}/answers` | Mentee | `{answer}`; lượt cuối → `enrichedGoal`, đồng bộ hồ sơ | 8.3–8.5 |
| POST | `/api/ai/cv/parse` | Auth | Parse CV không kèm chatbot (mentor điền nhanh hồ sơ) | 8.1, 8.2 |
| GET | `/api/ai/cv/{id}/file` | Owner / Admin / Mentor có quan hệ | Tải file PDF gốc. Mentor chỉ được tải khi mentoring-service xác nhận yêu cầu `PENDING`/`ACCEPTED` với chủ CV (timeout 3 s, lỗi ⇒ 403 — fail-closed) | 8.1, 8.6 |
| GET | `/api/ai/cv/mine` | Auth | CV của chính người gọi, mới nhất trước: `[{id, fileName, uploadedAt, fileUrl}]` | 8.6 |
| DELETE | `/api/ai/cv/{id}` | Owner / Admin | Xoá CV (204): hội thoại enrichment + dòng `cv_documents` trong 1 transaction → file trên volume (thiếu file vẫn 204) → best-effort gỡ `cvFileUrl` ở profile-service. 403 `FORBIDDEN`, 404 `CV_NOT_FOUND`. Chi tiết: [cv-data-policy.md](cv-data-policy.md) §6 | 8.6 |

Lỗi file CV: 400 `INVALID_FILE_TYPE` / `INVALID_PDF` / `ENCRYPTED_PDF` / `CV_TOO_LONG` / `CV_NO_TEXT`,
413 `FILE_TOO_LARGE`. Engine không sinh được câu hỏi tiếp theo → 502 `AI_ENGINE_UNAVAILABLE` và không
ghi gì vào CSDL, người dùng gửi lại được.

## 8. Ví dụ gọi API bằng curl

```bash
# Đăng nhập
TOKEN=$(curl -s -X POST localhost:8081/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"mentee@demo.local","password":"Demo@123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# Tìm mentor (thay <menteeId>)
curl -s "localhost:8090/api/matching/mentors?menteeId=<menteeId>&limit=5" -H "Authorization: Bearer $TOKEN"

# Upload CV
curl -s -X POST localhost:8091/api/ai/mentee/<menteeId>/cv-upload \
  -H "Authorization: Bearer $TOKEN" -F file=@scripts/sample-cv.pdf
```
