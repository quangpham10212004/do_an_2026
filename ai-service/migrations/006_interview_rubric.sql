-- US-23 (PRD 6.1 rubric, PRD-AIV-7, PRD-AIV-9): điểm rubric từng câu, thông tin tái lập, REQUEST_RETAKE.
--
-- Điểm 4 tiêu chí (0-10). score (đã có) = điểm câu = 0.4*technical + 0.3*depth + 0.15*communication + 0.15*mentoring.
-- Lượt cũ (trước Sprint 3) giữ NULL ở các cột mới: giao diện hiển thị "—", score cũ vẫn dùng được.
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS score_technical     REAL CHECK (score_technical BETWEEN 0 AND 10);
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS score_depth         REAL CHECK (score_depth BETWEEN 0 AND 10);
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS score_communication REAL CHECK (score_communication BETWEEN 0 AND 10);
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS score_mentoring     REAL CHECK (score_mentoring BETWEEN 0 AND 10);
-- Cờ cho admin: PROMPT_INJECTION (câu trả lời ra lệnh cho người chấm), COPIED_ANSWER (dán > 500 ký tự một lần).
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS flags TEXT[] NOT NULL DEFAULT '{}';
-- PRD-AIV-7: engine thực sự đã chấm lượt này, model, phiên bản prompt, có fallback hay không (NULL với lượt cũ).
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS engine         TEXT;
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS model          TEXT;
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS prompt_version TEXT;
ALTER TABLE interview_turns ADD COLUMN IF NOT EXISTS fallback_used  BOOLEAN;

-- REQUEST_RETAKE: admin yêu cầu làm lại — không tính là một lần phỏng vấn, mentor bắt đầu lại được ngay.
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_status_check
    CHECK (status IN ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'RETAKE_REQUESTED'));

-- Chỉ số online (US-24): tỉ lệ quyết định admin trùng khuyến nghị AI — đọc trực tiếp từ status + recommendation.
CREATE INDEX IF NOT EXISTS idx_interviews_reviewed ON interviews (reviewed_at) WHERE reviewed_at IS NOT NULL;
