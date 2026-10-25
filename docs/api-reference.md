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

### 5.1 Yêu cầu mentoring & phiên

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| GET | `/api/mentoring/requests` | Auth | Yêu cầu của tôi (mentee đã gửi / mentor đã nhận) | 5.2 |
| POST | `/api/mentoring/requests` | Mentee | `{mentorId, message?}`; 400 mentor chưa xác thực, 409 trùng yêu cầu | 5.2 |
| POST | `/api/mentoring/requests/{id}/respond` | Mentor | `{decision: ACCEPT\|REJECT, note?}`; 409 `CAPACITY_FULL` | 5.3 |
| POST | `/api/mentoring/requests/{id}/cancel` | Mentee | Huỷ yêu cầu đang chờ | 5.2 |
| POST | `/api/mentoring/requests/{id}/complete` | Người tham gia | Kết thúc quan hệ mentoring | 5.3 |
| GET | `/api/mentoring/sessions?status=` | Auth | Lịch sử phiên | 5.7 |
| POST | `/api/mentoring/sessions` | Mentee | `{menteeId, mentorId, scheduledAt, durationMinutes?, topic?}`; 409 `MENTOR_NOT_AVAILABLE` | 5.4 |
| GET | `/api/mentoring/sessions/{id}` | Người tham gia | Chi tiết phiên | 5.7 |
| POST | `/api/mentoring/sessions/{id}/cancel` | Người tham gia | `{reason?}` — hoàn tiền nếu đã thanh toán | 6.3 |
| POST | `/api/mentoring/sessions/{id}/complete` | Mentor | Đánh dấu hoàn thành | 5.6 |
| POST | `/api/mentoring/sessions/{id}/review` | Mentee | `{rating 1..5, comment?}` (201) | 5.6 |
| GET | `/api/mentoring/mentors/{id}/reviews` | Auth | Đánh giá của mentor | 5.6 |
| GET | `/api/mentoring/mentors/{id}/available-slots?durationMinutes=&days=` | Auth | Khung giờ còn đặt được (bước 30 phút, 1–28 ngày tới): trong lịch rảnh, trừ phiên PENDING/CONFIRMED của mentor và của người gọi → `{timezone, durationMinutes, price, slots:[{startAt, endAt}]}`; chỉ trả thời điểm, không lộ phiên người khác | 5.4 |
| GET | `/api/mentoring/notifications?limit=` | Auth | `{unreadCount, items}` | 5.5 |
| POST | `/api/mentoring/notifications/{id}/read` | Auth | Đánh dấu đã đọc | 5.5 |
| POST | `/api/mentoring/notifications/read-all` | Auth | Đánh dấu tất cả đã đọc | 5.5 |
| GET | `/api/mentoring/admin/stats` | Admin | `{pendingSessions, confirmedSessions, completedSessions, cancelledSessions}` | — |

### 5.1.1 Bổ sung v2.0

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| POST | `/api/mentoring/sessions` | Mentee | v2.0: thời lượng cố định 60 phút (`INVALID_DURATION`), mentor chưa có giá → 409 `PRICE_NOT_SET`; tạo phiên PENDING rồi tạm giữ học phí từ ví → `AWAITING_MENTOR` (ví thiếu → giữ PENDING 15 phút). `kind: TRIAL` (15 phút, 30.000đ, không cần quan hệ mentoring; 409 `TRIAL_ALREADY_USED` / `TRIAL_LIMIT` / `TRIAL_DISABLED`); `referralCode` chỉ ở buổi thường đầu tiên với mentor (400 `REFERRAL_NOT_FIRST_BOOKING`, `REFERRAL_CODE_NOT_FOUND`, `REFERRAL_CODE_WRONG_MENTOR`); `mockIntake` bắt buộc khi `sessionType = MOCK_INTERVIEW` (US-58) | 5.4, 5.8, 6.5 |
| POST | `/api/mentoring/sessions/{id}/confirm` | Mentor | AWAITING_MENTOR → CONFIRMED; 409 `NOT_AWAITING_MENTOR` / `CONFIRM_WINDOW_CLOSED` | 5.4 |
| POST | `/api/mentoring/sessions/{id}/decline` | Mentor | `{reason?}` — từ chối buổi chờ xác nhận: hoàn 100%, không tính lỗi vi phạm | 5.4 |
| GET | `/api/mentoring/sessions/{id}/room` | Người tham gia | `{provider:"jitsi", roomName, domain, jwt, opensAt, closesAt}` (JWT HS256, chỉ buổi CONFIRMED, từ 10 phút trước giờ bắt đầu tới 30 phút sau giờ kết thúc). Lần gọi đầu của mỗi bên **ghi nhật ký vào phòng** | 5.9, 5.10 |
| POST | `/api/mentoring/sessions/{id}/report-absent` | Người tham gia | Báo bên kia vắng mặt: chỉ khi mình đã vào phòng, bên kia chưa vào và đã hết thời gian chờ (10 phút; trải nghiệm 5 phút) — 409 `GRACE_NOT_ELAPSED` / `YOU_NOT_JOINED` / `OTHER_SIDE_JOINED` | 5.10 |
| POST | `/api/mentoring/sessions/{id}/attendance` | Người tham gia | v2.0: báo vắng người đã có trong nhật ký phòng → 409 `ABSENCE_CONTRADICTS_LOG` | 5.10 |
| POST | `/api/mentoring/sessions/{id}/cancel` | Người tham gia | v2.0: trả `refundPercent` theo 3 bậc (24h/4h) | 5.11 |
| GET | `/api/mentoring/sessions/{id}/mock` · PUT `/sessions/{id}/scorecard` · GET `/mock-interviews/history` | Người tham gia | Phỏng vấn thử với mentor (US-58): intake, phiếu đánh giá, lịch sử | — |

Tin nhắn luôn che số điện thoại, email, đường dẫn ngoài và tài khoản mạng xã hội (`contactsMasked = true`); mỗi lần che ghi vào `contact_violations`, ≥ 3 lần / 30 ngày → thông báo admin (FR-5.12). Admin xem gộp theo người gửi: `GET /api/mentoring/admin/contact-violations?days=30` → `[{userId, userName, count, kinds, lastAt, flagged}]` (trang `/admin/contact-violations`).

### 5.2 Nội bộ

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/internal/sessions/{id}` | Internal | `{id, menteeId, mentorId, scheduledAt, durationMinutes, price, status}` |
| POST | `/internal/sessions/{id}/payment-succeeded` | Internal | `{transactionId}` → xác nhận phiên (FR-6.2) |
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
