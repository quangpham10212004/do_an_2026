-- 008 — US-45 (PRD-CV-3, CV-5, CV-6).
-- skipped: mentee bấm "Bỏ qua" câu hỏi chatbot (answer lưu chuỗi rỗng; engine coi như "không biết").
ALTER TABLE enrichment_messages ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT false;
-- added_skills: kỹ năng mentee chọn thêm vào hồ sơ từ CV (chip "gợi ý") lúc xác nhận mục tiêu — để khi xoá CV có thể
-- gỡ đúng các kỹ năng này khỏi hồ sơ.
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS added_skills TEXT[] NOT NULL DEFAULT '{}';
-- Lưu giữ 12 tháng: purged_at = lúc job xoá file + văn bản gốc + kết quả parse chưa được xác nhận.
ALTER TABLE cv_documents ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_cv_documents_retention ON cv_documents (created_at) WHERE purged_at IS NULL;
-- Hội thoại đã đồng bộ trước US-45: coi mọi kỹ năng đã duyệt là đã thêm (đúng hành vi cũ).
UPDATE enrichment_conversations c
   SET added_skills = ARRAY(SELECT jsonb_array_elements_text(COALESCE(d.confirmed_fields -> 'skills', '[]'::jsonb)))
  FROM cv_documents d
 WHERE d.id = c.cv_id AND c.goal_status = 'CONFIRMED' AND c.added_skills = '{}';
