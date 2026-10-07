-- US-20 (PRD-CV-2): người dùng xem lại & sửa thông tin trích xuất trước khi dùng.
--
-- confirmed_fields = các trường người dùng đã duyệt {role, skills[], yearsExperience, projects[], education[]}
-- (JSON camelCase). NULL = chưa duyệt: chatbot chưa được bắt đầu và KHÔNG kỹ năng nào từ CV được gửi sang hồ
-- sơ. Dữ liệu cũ giữ NULL — parsed_json là kết quả máy trích xuất, không phải lựa chọn của người dùng.
ALTER TABLE cv_documents ADD COLUMN IF NOT EXISTS confirmed_fields JSONB;
ALTER TABLE cv_documents ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Chatbot chỉ bắt đầu sau bước duyệt, tối đa 1 hội thoại cho mỗi CV (luồng cũ cũng chỉ tạo 1 hội thoại khi
-- upload), để bấm "bắt đầu" hai lần không tạo hai hội thoại.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrichment_conversations_cv ON enrichment_conversations (cv_id);
