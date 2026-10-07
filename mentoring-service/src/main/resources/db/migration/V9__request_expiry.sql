-- US-15 (PRD-REQ-3) — yêu cầu PENDING không được phản hồi sau 72 giờ (app.requests.expire-after) → EXPIRED.
ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_status_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_requests_pending_created ON mentoring_requests (created_at) WHERE status = 'PENDING';
