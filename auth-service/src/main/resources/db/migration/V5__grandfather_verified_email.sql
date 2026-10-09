-- US-39 (PRD-AUTH-3) — từ Sprint 4 tài khoản chưa xác thực email không được gửi yêu cầu / đặt lịch / thanh toán.
-- Tài khoản tạo TRƯỚC quy tắc này (dữ liệu demo, người dùng chưa từng được yêu cầu xác thực) được coi là đã xác thực để
-- không bị khoá chức năng đột ngột. Câu hỏi mở Q35 trong PRD ("Open questions") — đổi thì xoá migration này trước khi
-- triển khai lên CSDL mới.
UPDATE users SET email_verified = true, email_verification_token = NULL
WHERE email_verified = false AND role <> 'ADMIN';
