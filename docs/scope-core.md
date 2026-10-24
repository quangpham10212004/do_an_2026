# Phạm vi tập trung — chức năng lõi

Cập nhật 23/10/2026. Nhóm thu nhỏ phạm vi, ưu tiên hoàn thiện, kiểm thử và bảo vệ **5 chức năng lõi** trước. Phần còn lại
**vẫn nằm trong repo và vẫn chạy**, nhưng tạm gác: không phát triển thêm, không đưa vào demo chính, không bắt buộc nghiệm thu.

> Đây là khoanh phạm vi trong tài liệu, **không xoá code**. `docker compose up` vẫn dựng toàn bộ hệ thống vì
> mentoring-service gọi payment-service (đặt buổi trả bằng ví, thu nhập mentor, tranh chấp).

## 1. Chức năng lõi

| # | Chức năng | Service | Tài liệu | Kiểm thử chính |
|---|---|---|---|---|
| 1 | **AI Interview** xác thực mentor bằng chat, gợi ý hạng JUNIOR/SENIOR/EXPERT, xin nâng hạng sau 90 ngày | ai-service (`app/interview`) | `ai-features.md` §2 · `eval-interview.md` | `e2e_v2_tier`, `e2e_s3_ai_auth`, `e2e_s4_ai_auth`, `e2e_s5_ai_auth`, pytest ai-service |
| 2 | **AI Matching** mentor–mentee (embedding + pgvector) | matching-service | `ai-features.md` §1 · `design-ai-matching-spec.md` | `e2e_p0_profile_matching`, `e2e_s2/s3/s4_profile_matching`, `benchmark_matching.py`, pytest matching-service |
| 3 | **Phân tích CV** (Parsing) | ai-service (`app/cv`) | `ai-features.md` §3 · `cv-data-policy.md` · `eval-cv.md` | `e2e_s2_cv` |
| 4 | **Chatbot làm rõ mục tiêu** của mentee (CV enrichment) | ai-service (`app/enrichment`) | `ai-features.md` §3 | `e2e_s2_cv`, `e2e_s4_ai_auth` |
| 5 | **Mentoring**: yêu cầu kết nối, đặt lịch, đánh giá, thông báo, nhắn tin | mentoring-service | `business-domain-mentor-mentee.md` §2.4, §3 | `e2e_p0_mentoring`, `e2e_s2/s3/s4/s5/s6_mentoring`, `e2e_v2_booking`, `mvn test` |

Bắt buộc đi kèm (nền tảng của 5 chức năng trên, không tính là "gác"): **auth-service** (tài khoản, JWT, phân quyền) và
**profile-service** (hồ sơ, lịch rảnh — nguồn dữ liệu của Matching), cùng frontend các trang tương ứng: `register`, `login`,
`onboarding`, `profile`, `matching`, `mentors`, `interview`, `cv-enrichment`, `mentoring`, `messages`, `notifications`, `dashboard`.

## 2. Tạm gác

| Phần | Nằm ở đâu | Ghi chú |
|---|---|---|
| Phỏng vấn giọng nói (v2.1) và luyện phỏng vấn miễn phí cho mentee | ai-service (`app/practice`, route voice), frontend `interview`, `practice-interview`, `features/ai/Voice*` | Chưa nghiệm thu; cần `OPENAI_API_KEY`. Phỏng vấn **chat** vẫn thuộc lõi |
| Ví VND, nạp MoMo/VNPay, thu nhập mentor, referral theo mentor | payment-service, frontend `wallet`, `payment`, `earnings`, `referral` | **Vẫn được mentoring gọi** khi đặt buổi và tính thu nhập — chưa tách được |
| Buổi trải nghiệm 15 phút (30.000đ) | mentoring-service, payment-service | Phụ thuộc ví |
| Phòng học Jitsi + nhật ký vào phòng | mentoring-service, compose profile `jitsi` | Đã là compose profile tuỳ chọn |
| Khoá học, lộ trình, tiến độ | learning-service, frontend `learning` | Không phụ thuộc ngược từ 5 chức năng lõi |
| Phỏng vấn thử (mock interview) | mentoring-service, frontend `mock-interviews` | |

## 3. Phụ thuộc cần biết khi muốn gỡ phần gác

- **learning-service** là phần dễ tách nhất: chỉ frontend (`features/learning`, `LEARNING_SERVICE_URL`) gọi tới.
- **payment-service** khó tách: mentoring-service dùng `PaymentClient`, `PaymentOutbox`, `AttendanceService`,
  `DisputeService`, `AccountLockService`; auth-service cũng cấu hình `PAYMENT_SERVICE_URL`; ai-service/matching-service không phụ thuộc.
  Muốn bỏ ví phải sửa luồng đặt lịch của mentoring (cho đặt thẳng, không giữ tiền) — chưa làm.
- **Voice interview** tách được: chỉ bật khi có `OPENAI_API_KEY`, để trống thì chat vẫn chạy.

## 4. Gợi ý demo tập trung

1. Mentee đăng ký → tải CV → chatbot làm rõ mục tiêu → hồ sơ mục tiêu.
2. AI Matching gợi ý mentor (giải thích điểm khớp).
3. Mentor mới phỏng vấn xác thực bằng chat → được gợi ý hạng.
4. Mentee gửi yêu cầu → mentor chấp nhận → đặt lịch → nhắn tin → đánh giá.

Dữ liệu demo: `python3 scripts/seed_demo.py`. Chạy AI ở chế độ rule-based (không cần khoá) để demo ổn định, offline.
