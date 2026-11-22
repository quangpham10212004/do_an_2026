-- Admin yêu cầu thêm bằng chứng từ một bên của tranh chấp (tranh chấp giữ nguyên trạng thái).
CREATE TABLE IF NOT EXISTS dispute_evidence_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id   UUID NOT NULL REFERENCES disputes (id) ON DELETE CASCADE,
    party        TEXT NOT NULL CHECK (party IN ('MENTEE', 'MENTOR')),
    message      TEXT,
    requested_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dispute_id, party)
);
