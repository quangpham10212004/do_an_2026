-- US-01 — chính sách huỷ phiên + xem trước số tiền hoàn.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('MENTEE', 'MENTOR', 'SYSTEM'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS refund_percent INTEGER
    CHECK (refund_percent BETWEEN 0 AND 100);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Huỷ muộn phiên miễn phí (mentee huỷ < 2 giờ trước giờ bắt đầu). 3 lần trong 30 ngày → chặn đặt phiên
-- miễn phí 14 ngày (FREE_BOOKING_BLOCKED). Ngưỡng cấu hình ở app.cancellation.* (application.yml).
CREATE TABLE IF NOT EXISTS late_cancellations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id   UUID NOT NULL,
    session_id  UUID NOT NULL UNIQUE REFERENCES sessions(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_late_cancellations_mentee ON late_cancellations (mentee_id, created_at DESC);

-- Outbox cho lời gọi payment-service không được phép mất (điểm thưởng xin lỗi khi mentor huỷ).
-- Ghi cùng transaction với thay đổi trạng thái phiên; PaymentOutboxJob gửi lại tới khi thành công.
CREATE TABLE IF NOT EXISTS payment_outbox (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID,
    kind        TEXT NOT NULL CHECK (kind IN ('REWARD')),
    payload     TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_outbox_unsent ON payment_outbox (created_at) WHERE sent_at IS NULL;
