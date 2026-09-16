# Đặc tả API — MentorHub

Bảng tra cứu toàn bộ endpoint của 7 service (99 endpoint nghiệp vụ, 106 kể cả `/health`). Schema request/response đầy đủ nằm trong
`contracts/<service>.yaml` (OpenAPI 3.0.3) — có thể mở bằng <https://editor.swagger.io>.

## Quy ước chung

| Nội dung | Quy ước |
|---|---|
| Truy cập từ trình duyệt | Qua frontend: `http://localhost:3000/api/<service>/...` (proxy tới service) |
| Truy cập trực tiếp | `http://localhost:<port>/api/<service>/...` (8081 auth, 8082 profile, 8083 mentoring, 8084 payment, 8085 learning, 8090 matching, 8091 ai — chỉ `/internal`) |
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
| PATCH | `/api/auth/admin/users/{userId}/status` | Admin | `{status: ACTIVE\|LOCKED}` | 1.5 |

`AuthResponse = { userId, email, fullName, role, emailVerified, accessToken, refreshToken, expiresIn, referralApplied?, emailVerificationToken? }`

## 2. profile-service (8082) — Thảo

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| GET | `/api/profile/mentors?domain=&q=&page=&size=&includeUnverified=` | Auth | Duyệt mentor đã xác thực (admin xem được cả chưa duyệt) | 5.1 |
| GET | `/api/profile/mentor/{userId}` | Auth | Hồ sơ mentor kèm lịch rảnh, trạng thái xác thực, trạng thái embedding | 2.4 |
| PUT | `/api/profile/mentor/{userId}` | Owner (Mentor) | Tạo/cập nhật hồ sơ, tự sinh embedding | 2.4, 2.5 |
| GET | `/api/profile/mentor/{userId}/availability` | Auth | Lịch rảnh hằng tuần | 2.4 |
| PUT | `/api/profile/mentor/{userId}/availability` | Owner (Mentor) | `{slots:[{dayOfWeek, startTime, endTime}]}` thay toàn bộ | 2.4 |
| GET | `/api/profile/mentee/{userId}` | Owner / Mentor / Admin | Hồ sơ mentee | 2.1–2.3 |
| PUT | `/api/profile/mentee/{userId}` | Owner (Mentee) | Tạo/cập nhật hồ sơ, tự sinh embedding | 2.1–2.3, 2.5 |
| POST | `/api/profile/mentee/{userId}/enrichment-chat` | Owner / Internal | `{enrichedGoalText, cvSkills?, cvFileUrl?}` → cập nhật goal, gộp kỹ năng, sinh lại embedding | 8.5 |
| POST | `/api/profile/admin/embeddings/rebuild?force=` | Admin | Sinh embedding còn thiếu / sinh lại toàn bộ | 2.5 |
| GET | `/internal/profile-summary/{userId}` | Internal | `{userId, displayName, role, domain}` | — |
| GET | `/internal/mentor/{userId}` | Internal | Hồ sơ mentor đầy đủ | — |
| PUT | `/internal/mentor/{userId}/verification` | Internal | `{status}` | 7.4, 7.5 |
| PUT | `/internal/mentor/{userId}/rating` | Internal | `{rating, ratingCount}` | 5.6 |
| PUT | `/internal/mentor/{userId}/active-mentees` | Internal | `{activeMenteeCount}` | 4.4 |

## 3. matching-service (8090) — Thảo

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | `{status, modelLoaded}` | — |
| POST | `/internal/embed` | Internal | `{text}` → `{embedding: float[384]}` | 4.1 |
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
                "returned": 3, "weights": { "similarity": 0.7, "rating": 0.2, "experience": 0.1 } }
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

## 5. mentoring-service (8083) — Thắng (CV/enrichment: Quang)

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

### 5.2 AI Interview

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| POST | `/api/mentoring/interviews` | Mentor | Bắt đầu / tiếp tục phỏng vấn → `Interview` kèm `currentQuestion` | 7.1 |
| GET | `/api/mentoring/interviews/me` | Mentor | Buổi gần nhất (204 nếu chưa có) | 7.1 |
| GET | `/api/mentoring/interviews/{id}` | Owner / Admin | Chi tiết | 7.4 |
| POST | `/api/mentoring/interviews/{id}/answers` | Mentor | `{answer}` → trạng thái sau lượt | 7.2–7.4 |
| GET | `/api/mentoring/admin/interviews?status=` | Admin | Danh sách theo trạng thái | 7.5 |
| POST | `/api/mentoring/admin/interviews/{id}/review` | Admin | `{decision: APPROVE\|REJECT, note?}` | 7.5 |
| GET | `/api/mentoring/admin/stats` | Admin | Thống kê phiên & phỏng vấn | — |

### 5.3 CV Parsing + Chatbot enrichment

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| POST | `/api/mentoring/mentee/{id}/cv-upload` | Owner (Mentee) | `multipart/form-data: file` → `{cv, conversation}` | 8.1–8.3 |
| GET | `/api/mentoring/mentee/{id}/enrichment/latest` | Owner | CV + hội thoại gần nhất (204 nếu chưa có) | 8.3 |
| GET | `/api/mentoring/enrichment/conversations/{id}` | Owner | Chi tiết hội thoại | 8.3 |
| POST | `/api/mentoring/enrichment/conversations/{id}/answers` | Mentee | `{answer}`; lượt cuối → `enrichedGoal`, đồng bộ hồ sơ | 8.3–8.5 |
| POST | `/api/mentoring/cv/parse` | Auth | Parse CV không kèm chatbot (mentor điền nhanh hồ sơ) | 8.1, 8.2 |
| GET | `/api/mentoring/cv/{id}/file` | Owner / Mentor / Admin | Tải file PDF gốc | 8.1 |

Các endpoint AI Interview và CV/enrichment ở trên lưu trạng thái tại mentoring-service và gọi ai-service
(mục 7) để tính toán. ai-service không phản hồi → `502 AI_SERVICE_UNAVAILABLE`; lỗi file CV từ ai-service
(`INVALID_FILE_TYPE`, `CV_NO_TEXT`, …) được chuyển tiếp nguyên mã.

### 5.4 Nội bộ

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/internal/sessions/{id}` | Internal | `{id, menteeId, mentorId, scheduledAt, durationMinutes, price, status}` |
| POST | `/internal/sessions/{id}/payment-succeeded` | Internal | `{transactionId}` → xác nhận phiên (FR-6.2) |

## 6. payment-service (8084) — Thắng

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | Health check | — |
| POST | `/api/payment/charge` | Mentee | `{sessionId, amount?, card:{cardNumber, cardHolder?, expiry, cvv}}` → `Transaction` | 6.1–6.3 |
| GET | `/api/payment/transactions` | Auth | Giao dịch của tôi | 6.3 |
| GET | `/api/payment/transactions/{id}` | Người trả / mentor / Admin | Chi tiết | 6.3 |
| GET | `/api/payment/sessions/{sessionId}/transactions` | Người trả / mentor / Admin | Lịch sử giao dịch của phiên | 6.3 |
| GET | `/api/payment/referrals/me` | Auth | Mã giới thiệu, danh sách, điểm | 6.4–6.6 |
| GET | `/api/payment/admin/transactions?status=&page=&size=` | Admin | Giám sát giao dịch | 6.3 |
| GET | `/api/payment/admin/stats` | Admin | `{successCount, failedCount, refundedCount, totalRevenue}` | 6.3 |
| GET | `/api/payment/admin/referrals` | Admin | Giám sát referral | 6.6 |
| POST | `/internal/referrals` | Internal | `{code, refereeId}` (auth-service gọi) | 6.5 |
| POST | `/internal/payments/refund` | Internal | `{sessionId, reason?}` (mentoring-service gọi) | 6.3 |

**Thẻ test của cổng sandbox**

| Số thẻ | Kết quả |
|---|---|
| `4242 4242 4242 4242` | SUCCESS |
| `4000 0000 0000 0002` | FAILED — `CARD_DECLINED` |
| `4000 0000 0000 9995` | FAILED — `INSUFFICIENT_FUNDS` |
| Số sai Luhn / CVV sai / hết hạn | FAILED — `INVALID_CARD_NUMBER` / `INVALID_CVV` / `CARD_EXPIRED` |

## 7. ai-service (8091) — Thắng (`interview`), Quang (`cv`, `enrichment`)

Chỉ phục vụ mentoring-service (header `X-Internal-Token`), không lưu trạng thái. Mọi response có
`engine` (`DEEPSEEK` | `RULE_BASED`) và `fallbackUsed` (DeepSeek lỗi → kết quả do rule-based tạo).
Request có thể gửi `engine` đã dùng ở lượt trước để giữ nhất quán.

| Method | Endpoint | Quyền | Mô tả | FR |
|---|---|---|---|---|
| GET | `/health` | Public | `{status, llmEnabled, llmProvider, model}` | — |
| POST | `/internal/interview/first-question` | Internal | `{context, engine?}` → `{topic, strategy: OPENING, question}` | 7.1 |
| POST | `/internal/interview/evaluate` | Internal | `{context, history[], current, isLastTurn, engine?}` → `{score 0-10, feedback, next?}` | 7.2, 7.3 |
| POST | `/internal/interview/summarize` | Internal | `{context, turns[], engine?}` → `{overallScore 0-100, summary, strengths, weaknesses, recommendation}` | 7.4 |
| POST | `/internal/cv/parse` | Internal | `multipart: file, engine?` → `{rawText, parsed: ParsedCv}`; 400 `INVALID_FILE_TYPE`/`INVALID_PDF`/`ENCRYPTED_PDF`/`CV_TOO_LONG`/`CV_NO_TEXT`, 413 `FILE_TOO_LARGE` | 8.2 |
| POST | `/internal/enrichment/next-question` | Internal | `{context: {domain, currentLevel, currentGoal, cv, maxTurns}, history[], engine?}` → `{slot, slotLabel, question}` | 8.3 |
| POST | `/internal/enrichment/summarize` | Internal | `{context, history[], engine?}` → `{enrichedGoal}` | 8.4 |

---

## 8. Ví dụ gọi API bằng curl

```bash
# Đăng nhập
TOKEN=$(curl -s -X POST localhost:8081/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"mentee@demo.local","password":"Demo@123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# Tìm mentor (thay <menteeId>)
curl -s "localhost:8090/api/matching/mentors?menteeId=<menteeId>&limit=5" -H "Authorization: Bearer $TOKEN"

# Upload CV
curl -s -X POST localhost:8083/api/mentoring/mentee/<menteeId>/cv-upload \
  -H "Authorization: Bearer $TOKEN" -F file=@scripts/sample-cv.pdf
```
