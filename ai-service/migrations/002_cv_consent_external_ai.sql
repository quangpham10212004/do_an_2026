-- US-19 (PRD-CV-1): đồng ý gửi CV tới AI bên ngoài (DeepSeek), lưu theo từng CV.
--
-- false => parse CV và mọi lượt chatbot enrichment của CV đó chỉ dùng engine RULE_BASED (chạy trên máy chủ
-- nền tảng, không gọi DeepSeek). Dữ liệu cũ: CV tải lên trước Sprint 2 chưa từng được hỏi ý kiến nên
-- KHÔNG được coi là đã đồng ý => false (kể cả CV từng được parse bằng DeepSeek: từ nay không gửi thêm gì).
ALTER TABLE cv_documents ADD COLUMN IF NOT EXISTS consent_external_ai BOOLEAN NOT NULL DEFAULT false;

-- Hội thoại đang dở của các CV đó chuyển sang rule-based cho các lượt còn lại (cột engine phản ánh engine
-- dùng từ nay; các câu hỏi đã sinh giữ nguyên).
UPDATE enrichment_conversations c SET engine = 'RULE_BASED'
  FROM cv_documents d
 WHERE d.id = c.cv_id AND c.status = 'IN_PROGRESS' AND d.consent_external_ai = false AND c.engine <> 'RULE_BASED';
