-- Gói buổi (combo): mentee mua N buổi giá ưu đãi một lần, mỗi lần đặt phiên trừ 1 buổi (phiên dùng gói có price = 0 và
-- package_id). PENDING_PAYMENT → ACTIVE (payment-service báo đã thu tiền) → EXHAUSTED | EXPIRED | CANCELLED. Gói hết hạn /
-- bị huỷ mà còn buổi chưa dùng thì refund_due tăng và refund_pending bật; PackageScheduler gọi payment-service hoàn tiền
-- (gửi tổng luỹ kế nên gọi lại không hoàn trùng) cho tới khi refunded_amount bắt kịp refund_due.
CREATE TABLE IF NOT EXISTS session_packages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id          UUID NOT NULL,
    mentor_id          UUID NOT NULL,
    request_id         UUID REFERENCES mentoring_requests(id),
    sessions_total     INTEGER NOT NULL CHECK (sessions_total > 0),
    sessions_remaining INTEGER NOT NULL CHECK (sessions_remaining >= 0),
    duration_minutes   INTEGER NOT NULL CHECK (duration_minutes BETWEEN 30 AND 240),
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
CREATE INDEX IF NOT EXISTS idx_packages_refund_pending ON session_packages (id) WHERE refund_pending;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES session_packages(id);
CREATE INDEX IF NOT EXISTS idx_sessions_package ON sessions (package_id) WHERE package_id IS NOT NULL;
