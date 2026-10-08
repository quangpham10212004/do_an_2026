-- Migration cho mentoring_db đã có dữ liệu: buổi làm quen, đổi lịch, gói buổi.
-- Chạy: docker compose exec -T mentoring-db psql -U postgres -d mentoring_db < db/migrations/2026-10-booking-v2-mentoring.sql
-- Idempotent: chạy lại nhiều lần không lỗi. (DB mới tạo từ db/init/ đã có sẵn các thay đổi này.)

BEGIN;

ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_status_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_status_check
    CHECK (status IN ('PENDING', 'INTRO', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS mentee_decision TEXT;
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS mentor_decision TEXT;
ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_mentee_decision_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_mentee_decision_check CHECK (mentee_decision IN ('CONTINUE', 'DECLINE'));
ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_mentor_decision_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_mentor_decision_check CHECK (mentor_decision IN ('CONTINUE', 'DECLINE'));

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'REGULAR';
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check CHECK (session_type IN ('INTRO', 'REGULAR'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS proposed_by UUID;

CREATE TABLE IF NOT EXISTS session_packages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id          UUID NOT NULL,
    mentor_id          UUID NOT NULL,
    request_id         UUID REFERENCES mentoring_requests(id),
    sessions_total     INTEGER NOT NULL CHECK (sessions_total > 0),
    sessions_remaining INTEGER NOT NULL CHECK (sessions_remaining >= 0),
    duration_minutes   INTEGER NOT NULL CHECK (duration_minutes BETWEEN 30 AND 180),
    discount_percent   INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
    unit_price         NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    total_price        NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    status             TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
        CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED')),
    expires_at         TIMESTAMPTZ,
    refund_due         NUMERIC(12,2) NOT NULL DEFAULT 0,
    refund_pending     BOOLEAN NOT NULL DEFAULT false,
    refunded_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_packages_mentee ON session_packages (mentee_id, status);
CREATE INDEX IF NOT EXISTS idx_packages_mentor ON session_packages (mentor_id, status);

COMMIT;
