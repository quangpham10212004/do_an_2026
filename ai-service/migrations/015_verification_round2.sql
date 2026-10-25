-- 015 — Vòng 2 xác thực mentor: admin phỏng vấn qua Jitsi (docs/design-mentor-verification.md §6, §9).
-- verification_slots = khung giờ admin đề xuất (chỉ có giờ bắt đầu, D8: không giới hạn thời lượng); mentor chọn một khung.
-- verification_interviews = một buổi vòng 2 (đổi giờ / vắng / admin RESCHEDULE sinh buổi mới); phiếu chấm 5 tiêu chí lưu ở đây.
ALTER TABLE verification_applications ADD COLUMN IF NOT EXISTS choice_deadline TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS verification_slots (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES verification_applications (id) ON DELETE CASCADE,
    starts_at      TIMESTAMPTZ NOT NULL,
    status         TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'CHOSEN', 'EXPIRED')),
    proposed_by    UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_slots_application ON verification_slots (application_id, starts_at);

CREATE TABLE IF NOT EXISTS verification_interviews (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id   UUID NOT NULL REFERENCES verification_applications (id) ON DELETE CASCADE,
    slot_id          UUID REFERENCES verification_slots (id),
    admin_id         UUID NOT NULL,
    scheduled_at     TIMESTAMPTZ NOT NULL,
    status           TEXT NOT NULL DEFAULT 'SCHEDULED'
                     CHECK (status IN ('SCHEDULED', 'COMPLETED', 'MENTOR_NO_SHOW', 'RESCHEDULED')),
    room_name        TEXT NOT NULL,
    mentor_joined_at TIMESTAMPTZ,
    admin_joined_at  TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    scores           JSONB,
    score_notes      JSONB,
    total_score      REAL,
    recommendation   TEXT CHECK (recommendation IN ('APPROVE', 'REJECT', 'NEEDS_REVIEW')),
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Mỗi đợt chỉ có một buổi đang chờ diễn ra
CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_interview_scheduled ON verification_interviews (application_id)
    WHERE status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS idx_verification_interviews_application ON verification_interviews (application_id, created_at);
