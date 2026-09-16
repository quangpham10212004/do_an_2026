# Thiết kế cơ sở dữ liệu — MentorHub

Nguyên tắc **database-per-service**: mỗi service sở hữu một CSDL PostgreSQL 16 riêng; không service
nào ghi vào CSDL của service khác. Liên kết giữa các service chỉ là **khoá tham chiếu logic** (UUID
người dùng/phiên) — không có khoá ngoại vật lý xuyên CSDL. Schema nằm tại `db/init/<service>.sql`
và được chạy tự động khi container CSDL khởi tạo lần đầu.

| CSDL | Service sở hữu | Cổng host | Ghi chú |
|---|---|---|---|
| `auth_db` | auth-service | 5433 | |
| `profile_db` | profile-service | 5434 | Image `pgvector/pgvector:pg16`; matching-service đọc read-only qua role `matching_reader` |
| `mentoring_db` | mentoring-service | 5435 | |
| `payment_db` | payment-service | 5436 | |
| `learning_db` | learning-service | 5437 | Có dữ liệu seed khoá học/roadmap |

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
        numeric hourly_rate "VND/giờ"
        int capacity
        int active_mentee_count "đồng bộ từ mentoring"
        boolean is_available
        real rating "đồng bộ từ mentoring"
        int rating_count
        text verification_status "PENDING_INTERVIEW|PENDING_REVIEW|APPROVED|REJECTED"
        vector_384 embedding
        text embedding_text_hash "SHA-256, NULL = cần sinh lại"
        timestamptz embedding_updated_at
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
        vector_384 embedding
        text embedding_text_hash
        timestamptz embedding_updated_at
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
| `mentor_profiles` | Hồ sơ mentor + dữ liệu phục vụ matching (vector, trạng thái xác thực, sức chứa, rating) |
| `mentee_profiles` | Hồ sơ mentee + vector |
| `mentor_availability` | Khung giờ rảnh lặp lại hằng tuần (giờ Việt Nam); `CHECK (end_time > start_time)` |
| `idx_mentor_profiles_embedding`, `idx_mentee_profiles_embedding` | Chỉ mục **HNSW** với `vector_cosine_ops` phục vụ truy vấn láng giềng gần nhất theo cosine |
| Role `matching_reader` | Chỉ có `SELECT` trên 3 bảng trên — hiện thực hoá ngoại lệ kiến trúc read-only |

Ý nghĩa `embedding_text_hash` (NFR-7): lưu SHA-256 của đoạn văn bản chuẩn hoá đã dùng để sinh vector.
Khi lưu hồ sơ, nếu hash không đổi thì bỏ qua bước gọi model; nếu gọi model lỗi thì đặt `NULL` để job
retry nhận ra (vector cũ vẫn giữ để matching tiếp tục hoạt động).

---

## 3. mentoring_db

```mermaid
erDiagram
    mentoring_requests ||--o{ sessions : "đặt lịch từ"
    sessions ||--o| reviews : "được đánh giá"
    interviews ||--|{ interview_turns : "gồm"
    cv_documents ||--o{ enrichment_conversations : "khởi tạo"
    enrichment_conversations ||--|{ enrichment_messages : "gồm"

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
        int duration_minutes "15..240"
        numeric price
        text topic
        text status "PENDING|CONFIRMED|COMPLETED|CANCELLED"
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
| `mentoring_requests` | Yêu cầu mentoring; số yêu cầu `ACCEPTED` phân biệt theo mentee = số mentee đang được hướng dẫn (so với `capacity`) |
| `sessions` | Phiên mentoring. `PENDING` = chờ thanh toán. Chỉ mục `(mentor_id, scheduled_at)` phục vụ kiểm tra trùng lịch |
| `reviews` | Đánh giá 1–1 với phiên (`session_id` UNIQUE) |
| `notifications` | Thông báo trong ứng dụng, gửi cho 1 người hoặc cho cả role ADMIN |
| `interviews` | Buổi AI Interview + kết quả tổng hợp + quyết định admin. Phần tính toán AI ở ai-service (không có CSDL); `engine` ghi engine đã dùng để các lượt sau nhất quán |
| `interview_turns` | Từng lượt hỏi-đáp; `UNIQUE (interview_id, turn_no)` chống ghi trùng |
| `cv_documents` | CV đã upload: văn bản trích xuất + kết quả parse (JSON); file PDF nằm trên volume `cv-storage` |
| `enrichment_conversations` / `enrichment_messages` | Hội thoại chatbot làm rõ mục tiêu và từng lượt hỏi-đáp theo slot |

---

## 4. payment_db

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
| `reward_ledger` | Sổ cái điểm thưởng dạng append-only; số dư = `SUM(points)` |

---

## 5. learning_db

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

## 6. Ánh xạ tham chiếu giữa các CSDL

| Giá trị | Nguồn gốc | Được tham chiếu ở |
|---|---|---|
| `users.id` | auth_db | `mentor_profiles.user_id`, `mentee_profiles.user_id`, `mentoring_requests.mentee_id/mentor_id`, `sessions.*_id`, `interviews.mentor_id`, `cv_documents.user_id`, `transactions.payer_id/mentor_id`, `referral_codes.user_id`, `referrals.*_id`, `course_enrollments.user_id`… |
| `sessions.id` | mentoring_db | `transactions.session_id` |
| `cv_documents.id` | mentoring_db | `mentee_profiles.cv_file_url` (dạng `/api/mentoring/cv/{id}/file`) |
