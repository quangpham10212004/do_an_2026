-- 007 — US-43 (PRD-AIV-3): buổi phỏng vấn IN_PROGRESS tiếp tục được trong 72 giờ kể từ hoạt động gần nhất; quá hạn →
-- ABANDONED và tính là một lần phỏng vấn (US-22). abandoned_at = lúc hệ thống đánh dấu.
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_status_check
    CHECK (status IN ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'RETAKE_REQUESTED', 'ABANDONED'));
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_interviews_in_progress ON interviews (created_at) WHERE status = 'IN_PROGRESS';
