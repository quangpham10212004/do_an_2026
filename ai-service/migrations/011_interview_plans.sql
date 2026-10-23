-- 011 — Kế hoạch câu hỏi do AI soạn cho phỏng vấn giọng nói (v2.1, phương án A).
-- plan = {topics: [{name, question, followUp, expectedConcepts[], source BANK|CV|GOAL|AI}], engine, promptVersion}:
-- soạn MỘT lần lúc bắt đầu (DeepSeek, lỗi => ngân hàng câu hỏi), lưu lại để kết nối lại hỏi đúng câu cũ, admin xem được
-- câu đã hỏi và nguồn, người chấm rule-based dùng expectedConcepts. NULL = buổi tạo trước 011 (dùng ngân hàng câu hỏi).
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS plan JSONB;
ALTER TABLE practice_interviews ADD COLUMN IF NOT EXISTS plan JSONB;
