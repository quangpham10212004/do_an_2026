-- US-06 (PRD-SES-5/6) — đề xuất dời lịch phiên CONFIRMED. Khung giờ đề xuất được tính là bận khi còn PENDING.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reschedule_proposals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID NOT NULL REFERENCES sessions(id),
    proposed_by   UUID NOT NULL,
    new_start     TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at  TIMESTAMPTZ
);

-- Mỗi phiên chỉ có tối đa 1 đề xuất đang mở
CREATE UNIQUE INDEX IF NOT EXISTS uq_reschedule_open_per_session
    ON reschedule_proposals (session_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_reschedule_pending_start
    ON reschedule_proposals (new_start) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_reschedule_pending_expiry
    ON reschedule_proposals (expires_at) WHERE status = 'PENDING';
