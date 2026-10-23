-- 013 — Đề nghị đổi lĩnh vực khi mục tiêu mentee nói với chatbot khác lĩnh vực trong hồ sơ.
-- profile_domain: lĩnh vực hồ sơ lúc hội thoại kết thúc; suggested_domain: lĩnh vực suy ra từ câu trả lời (chỉ khi khác);
-- confirmed_domain: lĩnh vực mentee chọn đổi khi xác nhận mục tiêu (NULL = giữ nguyên) — gửi kèm goal sang profile-service.
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS profile_domain TEXT;
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS suggested_domain TEXT;
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS confirmed_domain TEXT;
