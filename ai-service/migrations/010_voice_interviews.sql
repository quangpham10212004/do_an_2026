-- 010 — Phỏng vấn giọng nói (v2.1).
-- FR-7.7: mentor chọn chat (CHAT) hoặc giọng nói (VOICE) cho buổi AI Interview; cùng quy tắc số lần / chờ / nâng cấp.
-- consent_external_ai = mentor đồng ý âm thanh được OpenAI (Mỹ) xử lý (bắt buộc với VOICE).
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'CHAT'
    CHECK (mode IN ('CHAT', 'VOICE'));
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS consent_external_ai BOOLEAN NOT NULL DEFAULT false;

-- FR-10.x — mentee luyện phỏng vấn với AI bằng giọng nói: 1 buổi miễn phí trọn đời (COMPLETED hoặc ABANDONED là đã dùng),
-- kết quả hiện ngay cho mentee, không qua admin.
CREATE TABLE IF NOT EXISTS practice_interviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id           UUID NOT NULL,
    interview_type      TEXT NOT NULL CHECK (interview_type IN ('BACKEND', 'FRONTEND', 'SYSTEM_DESIGN', 'BEHAVIORAL')),
    level               TEXT NOT NULL CHECK (level IN ('INTERN', 'FRESHER', 'JUNIOR')),
    target_role         TEXT NOT NULL CHECK (char_length(target_role) BETWEEN 2 AND 120),
    target_company      TEXT CHECK (target_company IS NULL OR char_length(target_company) <= 120),
    status              TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    topics              TEXT[] NOT NULL DEFAULT '{}',
    transcript          JSONB,
    result              JSONB,
    overall_score       REAL,
    engine              TEXT NOT NULL,
    consent_external_ai BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_practice_interviews_mentee ON practice_interviews (mentee_id, created_at DESC);
-- Mỗi mentee tối đa một buổi IN_PROGRESS (chống bấm bắt đầu hai lần cùng lúc).
CREATE UNIQUE INDEX IF NOT EXISTS uq_practice_interviews_in_progress ON practice_interviews (mentee_id)
    WHERE status = 'IN_PROGRESS';
