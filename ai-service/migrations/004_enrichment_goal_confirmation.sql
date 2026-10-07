-- US-21 (PRD-CV-4): goal do chatbot tổng hợp chỉ là BẢN NHÁP; hồ sơ chỉ đổi khi người dùng xác nhận.
--
-- goal_status: NONE (hội thoại chưa xong) → DRAFT (đã có enriched_goal, chờ người dùng) → CONFIRMED
-- (confirmed_goal = bản người dùng chọn/sửa; đồng bộ sang profile-service, profile_synced theo dõi việc gửi)
-- hoặc DISCARDED (không gửi gì).
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS goal_status TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS confirmed_goal TEXT;
ALTER TABLE enrichment_conversations ADD COLUMN IF NOT EXISTS goal_decided_at TIMESTAMPTZ;

-- Dữ liệu cũ (luồng Sprint 1 tự đồng bộ ngay khi hội thoại xong):
-- * đã đồng bộ => goal đó ĐÃ nằm trong hồ sơ: ghi nhận CONFIRMED với chính goal đã gửi.
UPDATE enrichment_conversations
   SET goal_status = 'CONFIRMED', confirmed_goal = enriched_goal, goal_decided_at = completed_at
 WHERE status = 'COMPLETED' AND profile_synced = true;
-- * xong nhưng chưa đồng bộ được (job đang thử lại) => chưa có gì trong hồ sơ: trở thành bản nháp chờ người
--   dùng quyết định, job thử lại không còn tự gửi nữa.
UPDATE enrichment_conversations SET goal_status = 'DRAFT'
 WHERE status = 'COMPLETED' AND profile_synced = false;

ALTER TABLE enrichment_conversations ADD CONSTRAINT enrichment_conversations_goal_status_check
    CHECK (goal_status IN ('NONE', 'DRAFT', 'CONFIRMED', 'DISCARDED'));
