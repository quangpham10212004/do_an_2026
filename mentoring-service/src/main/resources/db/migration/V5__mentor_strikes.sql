-- US-02 — vi phạm (strike) của mentor: mentor huỷ phiên (MENTOR_CANCEL); về sau có thể thêm MENTOR_NO_SHOW (US-12).
-- Strike thứ 3 trong 30 ngày → mentoring-service gọi profile-service PUT /internal/mentor/{id}/status PAUSED.
CREATE TABLE IF NOT EXISTS mentor_strikes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id   UUID NOT NULL,
    session_id  UUID REFERENCES sessions(id),
    reason      TEXT NOT NULL CHECK (reason IN ('MENTOR_CANCEL', 'MENTOR_NO_SHOW')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, reason)
);
CREATE INDEX IF NOT EXISTS idx_mentor_strikes_mentor ON mentor_strikes (mentor_id, created_at DESC);
