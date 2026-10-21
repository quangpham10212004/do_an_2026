# Thiết kế cơ sở dữ liệu — MentorHub

> **v2.0 (21/10/2026)** — nội dung đánh dấu ⚒ là **mục tiêu theo bản chốt** [ban-chot-nghiep-vu.md](ban-chot-nghiep-vu.md), chưa hiện thực; phần không đánh dấu mô tả hệ thống hiện tại.


Nguyên tắc **database-per-service**: mỗi service sở hữu một CSDL PostgreSQL 16 riêng; không service
nào ghi vào CSDL của service khác. Liên kết giữa các service chỉ là **khoá tham chiếu logic** (UUID
người dùng/phiên) — không có khoá ngoại vật lý xuyên CSDL. Schema nằm tại `db/init/<service>.sql`
và được chạy tự động khi container CSDL khởi tạo lần đầu.

| CSDL | Service sở hữu | Cổng host | Ghi chú |
|---|---|---|---|
| `auth_db` | auth-service | 5433 | |
| `profile_db` | profile-service | 5434 | matching-service đọc read-only qua role `matching_reader` |
| `matching_db` | matching-service | 5439 | Image `pgvector/pgvector:pg16`; chỉ mục embedding (vector + hash text nguồn) |
| `mentoring_db` | mentoring-service | 5435 | |
| `payment_db` | payment-service | 5436 | |
| `learning_db` | learning-service | 5437 | Có dữ liệu seed khoá học/roadmap |
| `ai_db` | ai-service | 5438 | Dữ liệu 3 tính năng AI hội thoại; file CV trên volume `cv-storage` |

Quy ước: tên bảng/cột `snake_case`; khoá chính `UUID DEFAULT gen_random_uuid()`; thời gian
`TIMESTAMPTZ`; trạng thái là `TEXT` + ràng buộc `CHECK` (ánh xạ `enum` trong Java).

---

## 1. auth_db

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "có"
    users {
        uuid id PK
        text email UK
        text password_hash "BCrypt"
        text full_name
        text role "MENTOR|MENTEE|ADMIN"
        text status "ACTIVE|LOCKED"
        boolean email_verified
        text email_verification_token
        timestamptz created_at
        timestamptz updated_at
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        text token_hash UK "SHA-256"
        timestamptz expires_at
        boolean revoked
        timestamptz created_at
    }
```

| Bảng | Mô tả |
|---|---|
| `users` | Tài khoản. Tài khoản ADMIN được tạo tự động khi khởi động (`AdminSeeder`), không đăng ký qua API |
| `refresh_tokens` | Refresh token dạng băm; `revoked = true` khi đã dùng để refresh, đăng xuất, đổi mật khẩu hoặc bị khoá |

Ngoài CSDL: Redis key `auth:login-fail:<email>` (đếm số lần đăng nhập sai, TTL 15 phút).

---

## 2. profile_db

```mermaid
erDiagram
    mentor_profiles ||--o{ mentor_availability : "có lịch rảnh"
    mentor_profiles {
        uuid user_id PK "= users.id (logic)"
        text display_name
        text_array skills
        text domain
        text bio
        int years_experience
        text cv_file_url
        text_array portfolio_links
        numeric hourly_rate "VND/buổi 60 phút; v2.0: nằm trong khung của tier"
        text tier "v2.0 ⚒ JUNIOR|SENIOR|EXPERT, NULL khi chưa duyệt"
        timestamptz tier_assigned_at "v2.0 ⚒ — xin nâng cấp sau 90 ngày"
        boolean trial_enabled "v2.0 ⚒ nhận buổi trải nghiệm, mặc định true"
        int capacity
        int active_mentee_count "đồng bộ từ mentoring"
        boolean is_available
        real rating "đồng bộ từ mentoring"
        int rating_count
        text verification_status "PENDING_INTERVIEW|PENDING_REVIEW|APPROVED|REJECTED"
    }
    mentee_profiles {
        uuid user_id PK
        text display_name
        text goal
        text domain
        text current_level "BEGINNER|INTERMEDIATE|ADVANCED"
        text_array skills
        text_array portfolio_links
        text cv_file_url
    }
    mentor_availability {
        uuid id PK
        uuid mentor_id FK
        int day_of_week "1=Thứ Hai..7=Chủ Nhật"
        time start_time
        time end_time
    }
```

| Đối tượng | Mô tả |
|---|---|
| `mentor_profiles` | Hồ sơ mentor + dữ liệu phục vụ matching (trạng thái xác thực, sức chứa, rating) |
| `mentee_profiles` | Hồ sơ mentee |
| `mentor_profiles.tier` *(v2.0 ⚒)* | Cấp độ do admin gán lúc duyệt phỏng vấn; khung giá lấy từ cấu hình `pricing.tiers` (JUNIOR 100–200k, SENIOR 200–400k, EXPERT 400–700k, bước 10.000đ); `hourly_rate` bị kẹp về khung khi đổi cấp |
| `mentor_availability` | Khung giờ rảnh lặp lại hằng tuần (giờ Việt Nam); `CHECK (end_time > start_time)` |
| Role `matching_reader` | Chỉ có `SELECT` trên 3 bảng trên — hiện thực hoá ngoại lệ kiến trúc read-only |

`profile_db` **không chứa vector**: embedding thuộc `matching_db` (mục 3). profile-service chỉ lưu nội
dung hồ sơ và báo matching-service khi nội dung đó thay đổi.

---

## 3. matching_db

```mermaid
erDiagram
    mentor_embeddings {
        uuid user_id PK "= mentor_profiles.user_id (logic, khác DB nên không có FK)"
        vector_384 embedding "NULL = chưa embed được"
        text text_hash "SHA-256 của text đã embed; NULL = chờ thử lại"
        timestamptz indexed_at
        int attempts "số lần thử lại liên tiếp bị lỗi"
        text last_error
    }
    mentee_embeddings {
        uuid user_id PK "= mentee_profiles.user_id (logic)"
        vector_384 embedding
        text text_hash
        timestamptz indexed_at
        int attempts
        text last_error
    }
```

| Đối tượng | Mô tả |
|---|---|
| `mentor_embeddings` | Vector của mentor — tập ứng viên cho bước top-K retrieval |
| `mentee_embeddings` | Vector của mentee — vector truy vấn, chỉ tra theo khoá chính |
| `idx_mentor_embeddings_vector` | Chỉ mục **HNSW** với `vector_cosine_ops` phục vụ truy vấn láng giềng gần nhất theo cosine |
| `idx_*_embeddings_pending` | Chỉ mục riêng phần (`WHERE embedding IS NULL`) cho `IndexSyncJob` quét dòng chờ thử lại |

Ý nghĩa `text_hash` (NFR-7): SHA-256 của đoạn văn bản chuẩn hoá đã dùng để sinh vector. Khi lập lại chỉ
mục, hash không đổi thì bỏ qua bước gọi model; gọi model lỗi thì đặt `NULL` để `IndexSyncJob` nhận ra
(vector cũ vẫn giữ để matching tiếp tục hoạt động).

Không có khoá ngoại tới `profile_db` vì khác database — `IndexSyncJob` chịu trách nhiệm xoá dòng chỉ
mục của hồ sơ đã bị xoá.

---

## 4. mentoring_db

```mermaid
erDiagram
    mentoring_requests ||--o{ sessions : "đặt lịch từ"
    sessions ||--o| reviews : "được đánh giá"

    mentoring_requests {
        uuid id PK
        uuid mentee_id
        uuid mentor_id
        text message
        text status "PENDING|ACCEPTED|REJECTED|CANCELLED|COMPLETED"
        text response_note
        timestamptz created_at
        timestamptz responded_at
    }
    sessions {
        uuid id PK
        uuid request_id FK
        uuid mentee_id
        uuid mentor_id
        timestamptz scheduled_at
        int duration_minutes "v2.0: 60 (thường) hoặc 15 (trải nghiệm)"
        numeric price "v2.0: chốt lúc gửi yêu cầu đặt"
        text kind "v2.0 ⚒ REGULAR|TRIAL"
        timestamptz mentor_joined_at "v2.0 ⚒ nhật ký vào phòng"
        timestamptz mentee_joined_at "v2.0 ⚒"
        text topic
        text status "PENDING|CONFIRMED|AWAITING_ATTENDANCE|COMPLETED|CANCELLED|EXPIRED|NO_SHOW_*|DISPUTED"
        boolean reminder_sent
    }
    reviews {
        uuid id PK
        uuid session_id FK,UK
        uuid mentee_id
        uuid mentor_id
        int rating "1..5"
        text comment
    }
    notifications {
        uuid id PK
        uuid recipient_id "NULL nếu gửi theo role"
        text recipient_role "ADMIN"
        text type
        text title
        text message
        text link
        boolean is_read
    }
```

| Bảng | Mô tả |
|---|---|
| `mentoring_requests` | Yêu cầu mentoring; số yêu cầu `ACCEPTED` phân biệt theo mentee = số mentee đang được hướng dẫn (so với `capacity`) |
| `sessions` | Phiên mentoring. `PENDING` = chờ thanh toán. Chỉ mục `(mentor_id, scheduled_at)` phục vụ kiểm tra trùng lịch |
| `reviews` | Đánh giá 1–1 với phiên (`session_id` UNIQUE); v2.0: không có đánh giá cho `kind = TRIAL` |
| `sessions.kind`, `*_joined_at` *(v2.0 ⚒)* | Loại buổi và nhật ký vào phòng — căn cứ duy nhất xác định vắng mặt (chờ 10 phút; trải nghiệm 5 phút) |
| `trial_uses` *(v2.0 ⚒)* | `(mentee_id, mentor_id)` UNIQUE — mỗi cặp một buổi trải nghiệm |
| `contact_violations` *(v2.0 ⚒)* | Mỗi lần tin nhắn bị che thông tin liên hệ; 3 lần/30 ngày báo admin |
| `notifications` | Thông báo trong ứng dụng, gửi cho 1 người hoặc cho cả role ADMIN; ai-service tạo thông báo qua `POST /internal/notifications` |

---

## 5. ai_db

ai-service sở hữu trọn vẹn dữ liệu của AI Interview và CV Parsing + Chatbot enrichment (trước đây các
bảng này nằm trong `mentoring_db` và do mentoring-service điều phối).

```mermaid
erDiagram
    interviews ||--|{ interview_turns : "gồm"
    cv_documents ||--o{ enrichment_conversations : "khởi tạo"
    enrichment_conversations ||--|{ enrichment_messages : "gồm"

    interviews {
        uuid id PK
        uuid mentor_id
        text domain
        text_array skills
        text status "IN_PROGRESS|PENDING_REVIEW|APPROVED|REJECTED"
        int max_turns
        int current_turn
        text engine "DEEPSEEK|RULE_BASED"
        real overall_score "0..100"
        text summary
        text strengths
        text weaknesses
        text recommendation "APPROVE|REJECT|NEEDS_REVIEW"
        uuid reviewed_by
        text review_note
    }
    interview_turns {
        uuid id PK
        uuid interview_id FK
        int turn_no
        text topic
        text strategy "OPENING|DEEPEN|PIVOT"
        text question
        text answer
        real score "0..10"
        text feedback
    }
    cv_documents {
        uuid id PK
        uuid user_id
        text file_name
        text storage_path
        text raw_text
        text parsed_json
        text engine
    }
    enrichment_conversations {
        uuid id PK
        uuid mentee_id
        uuid cv_id FK
        text status "IN_PROGRESS|COMPLETED"
        int max_turns
        int current_turn
        text engine
        text enriched_goal
        boolean profile_synced
    }
    enrichment_messages {
        uuid id PK
        uuid conversation_id FK
        int turn_no
        text slot
        text question
        text answer
    }
```

| Bảng | Mô tả |
|---|---|
| `interviews` | Buổi AI Interview + kết quả tổng hợp + quyết định admin; `engine` ghi engine đã dùng để các lượt sau nhất quán |
| `interview_turns` | Từng lượt hỏi-đáp; `UNIQUE (interview_id, turn_no)` chống ghi trùng; ghi câu trả lời bằng `UPDATE ... WHERE answer IS NULL` |
| `cv_documents` | CV đã upload: văn bản trích xuất + kết quả parse (`JSONB`); file PDF nằm trên volume `cv-storage` |
| `enrichment_conversations` / `enrichment_messages` | Hội thoại chatbot làm rõ mục tiêu và từng lượt hỏi-đáp theo slot; `profile_synced` = đã đẩy goal sang profile-service (job nền thử lại nếu chưa) |

---

## 6. payment_db

```mermaid
erDiagram
    referral_codes ||--o{ referrals : "được dùng trong"
    referrals ||--o{ reward_ledger : "sinh điểm"
    transactions {
        uuid id PK
        uuid session_id "logic → sessions.id"
        uuid payer_id
        uuid mentor_id
        numeric amount
        text currency
        text status "PENDING|SUCCESS|FAILED|REFUNDED"
        text provider "SANDBOX"
        text provider_reference
        text failure_reason
        boolean session_synced
    }
    referral_codes {
        uuid user_id PK
        text code UK
    }
    referrals {
        uuid id PK
        uuid referrer_id
        uuid referee_id UK
        text code
        text status "REGISTERED|QUALIFIED|REJECTED"
        text reject_reason
        uuid qualifying_tx_id
        timestamptz qualified_at
    }
    reward_ledger {
        uuid id PK
        uuid user_id
        int points
        text reason
        uuid referral_id FK
    }
```

| Đối tượng | Mô tả |
|---|---|
| `transactions` | Giao dịch thanh toán; `uq_transactions_session_success` — unique partial index đảm bảo mỗi phiên tối đa 1 giao dịch `SUCCESS` |
| `referral_codes` | Mỗi người dùng 1 mã (tạo lần đầu khi xem trang giới thiệu) |
| `referrals` | Quan hệ người giới thiệu → người được giới thiệu; `CHECK (referrer_id <> referee_id)`, `referee_id` UNIQUE |
| `reward_ledger` | Sổ cái điểm thưởng dạng append-only; số dư = `SUM(points)` — **v2.0 ⚒ thay bằng `wallet_entries` (kind `PROMO`)**, `reward_ledger` giữ lại để truy vết |

### 6.1 Ví VND *(v2.0 ⚒)*

```mermaid
erDiagram
    wallets ||--o{ wallet_entries : "bút toán"
    wallets {
        uuid user_id PK
        text status "ACTIVE|DORMANT|FROZEN"
        timestamptz last_activity_at "12 tháng không giao dịch → DORMANT"
    }
    wallet_entries {
        uuid id PK
        uuid user_id FK
        text kind "TOPUP|HOLD|RELEASE_TO_EARNING|REFUND_TO_WALLET|REFUND_TO_SOURCE|PROMO_GRANT|PROMO_EXPIRE|ADJUST"
        text bucket "CASH|PROMO"
        numeric amount "có dấu; số dư = SUM theo bucket"
        text state "AVAILABLE|HELD|FROZEN"
        uuid session_id "NULL nếu không gắn buổi"
        uuid topup_tx_id "nguồn nạp, dùng khi hoàn về nguồn"
        timestamptz expires_at "chỉ PROMO: +12 tháng"
        text idempotency_key UK
    }
    topup_refund_requests {
        uuid id PK
        uuid user_id
        numeric amount "<= min(CASH khả dụng, tiền nạp 7 ngày)"
        text status "PENDING|DONE|REJECTED"
        text admin_reason
    }
```

| Đối tượng | Mô tả |
|---|---|
| `wallet_entries` | Sổ cái append-only; **không có cột số dư**. Số dư khả dụng = `SUM(amount)` theo `bucket` và `state`. `idempotency_key` UNIQUE chống ghi trùng (IPN, retry) |
| `HOLD` | Chuyển khả dụng → tạm giữ; trừ `PROMO` trước, thiếu thì trừ `CASH`; mỗi bucket là một dòng để hoàn đúng nguồn |
| `REFUND_TO_WALLET` | Hoàn tiền buổi học về đúng bucket đã trừ (khuyến mãi đã hết hạn thì cấp lại hạn 30 ngày) |
| `REFUND_TO_SOURCE` | Hoàn tiền nạp qua cổng; chỉ `CASH`, trong 7 ngày từ lần nạp gần nhất, tối đa 2 yêu cầu/tháng |
| `PROMO_EXPIRE` | Job hằng ngày: khoản `PROMO` quá `expires_at` bị trừ; ví không hoạt động 12 tháng → `DORMANT` |
| `wallets.status = FROZEN` | Admin khoá tài khoản: không đặt, không hoàn ra nguồn |
| `referral_codes` | v2.0: khoá `(owner_id, mentor_id)` thay vì một mã mỗi người; `referrals.qualifying_session_id` + `eligible_at = completed_at + 7 ngày` |
| `mentor_ledger` | Giữ nguyên (US-25); `release-delay` 72 giờ và khiếu nại giữ thu nhập |

---

## 7. learning_db

```mermaid
erDiagram
    courses ||--o{ course_materials : "gồm"
    courses ||--o{ course_enrollments : "được đăng ký"
    courses ||--o{ course_progress : "tiến độ"
    course_materials ||--o{ material_completions : "được hoàn thành"
    roadmaps ||--o{ roadmap_items : "gồm"
    courses |o--o{ roadmap_items : "liên kết"
    roadmap_items ||--o{ roadmap_item_progress : "được hoàn thành"

    courses {
        uuid id PK
        text title
        text description
        text domain
        text level
        text_array skills
    }
    course_materials {
        uuid id PK
        uuid course_id FK
        text title
        text type "ARTICLE|VIDEO|DOCUMENT|EXERCISE"
        text url
        text content
        int order_index
    }
    course_enrollments {
        uuid course_id PK,FK
        uuid user_id PK
    }
    material_completions {
        uuid material_id PK,FK
        uuid user_id PK
    }
    course_progress {
        uuid course_id PK,FK
        uuid user_id PK
        real percent_complete
    }
    roadmaps {
        uuid id PK
        text title
        text track
        text description
    }
    roadmap_items {
        uuid id PK
        uuid roadmap_id FK
        text title
        text description
        int order_index
        uuid course_id FK
    }
    roadmap_item_progress {
        uuid item_id PK,FK
        uuid user_id PK
    }
```

`course_progress.percent_complete` = số tài liệu đã hoàn thành / tổng số tài liệu × 100 (làm tròn 1
chữ số thập phân), được tính lại mỗi khi người dùng đánh dấu/bỏ đánh dấu một tài liệu. Dữ liệu seed:
5 khoá học, 15 tài liệu, 3 roadmap (Backend, DevOps, Frontend).

---

## 8. Ánh xạ tham chiếu giữa các CSDL

| Giá trị | Nguồn gốc | Được tham chiếu ở |
|---|---|---|
| `users.id` | auth_db | `mentor_profiles.user_id`, `mentee_profiles.user_id`, `mentoring_requests.mentee_id/mentor_id`, `sessions.*_id`, `interviews.mentor_id` (ai_db), `cv_documents.user_id` (ai_db), `transactions.payer_id/mentor_id`, `referral_codes.user_id`, `referrals.*_id`, `course_enrollments.user_id`… |
| `sessions.id` | mentoring_db | `transactions.session_id` |
| `cv_documents.id` | ai_db | `mentee_profiles.cv_file_url`, `mentor_profiles.cv_file_url` (dạng `/api/ai/cv/{id}/file`) — khi CV bị xoá, ai-service gọi `DELETE /internal/profile/{userId}/cv-file` để gỡ giá trị nếu còn khớp (best-effort, không có FK) |
| `mentor_profiles.user_id`, `mentee_profiles.user_id` | profile_db | `mentor_embeddings.user_id`, `mentee_embeddings.user_id` (matching_db) — `IndexSyncJob` dọn dòng mồ côi thay cho khoá ngoại |
