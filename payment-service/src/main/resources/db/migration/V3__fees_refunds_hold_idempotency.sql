-- US-13 (PRD-PAY-1/2/7) — phí nền tảng, bảng hoàn tiền riêng, tạm giữ giao dịch, Idempotency-Key cho charge.

-- 1) Phí nền tảng chốt tại thời điểm charge: đổi app.payment.platform-fee-rate về sau KHÔNG làm đổi các dòng cũ.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_rate       NUMERIC(5,4);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee            NUMERIC(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS mentor_earning NUMERIC(12,2);
-- Backfill dòng cũ theo mức phí mặc định 15% (làm tròn tới 1đ, mentor nhận phần còn lại).
UPDATE transactions
   SET fee_rate = 0.15,
       fee = ROUND(amount * 0.15, 0),
       mentor_earning = amount - ROUND(amount * 0.15, 0)
 WHERE fee IS NULL;
ALTER TABLE transactions ALTER COLUMN fee_rate SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN fee SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN mentor_earning SET NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_fee_split_check
    CHECK (fee >= 0 AND mentor_earning >= 0 AND fee + mentor_earning = amount);

-- 2) Trạng thái mới: PARTIALLY_REFUNDED, ON_HOLD (US-12 tranh chấp: SUCCESS → ON_HOLD → SUCCESS).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS held_at     TIMESTAMPTZ;

-- Tối đa 1 giao dịch "đã thu tiền" (SUCCESS / ON_HOLD / PARTIALLY_REFUNDED) cho mỗi phiên.
DROP INDEX IF EXISTS uq_transactions_session_success;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_session_paid
    ON transactions (session_id) WHERE status IN ('SUCCESS', 'ON_HOLD', 'PARTIALLY_REFUNDED');

-- 3) Hoàn tiền là bản ghi riêng (không ghi đè giao dịch); SUM(refunds.amount) ≤ transactions.amount (kiểm tra ở service
--    dưới khoá dòng giao dịch).
CREATE TABLE IF NOT EXISTS refunds (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES transactions(id),
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason              TEXT,
    actor_id            UUID,                      -- NULL = hệ thống / service nội bộ
    provider_reference  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refunds_transaction ON refunds (transaction_id);

-- Giao dịch đã REFUNDED trước US-13: tạo 1 dòng refund toàn phần (lý do cũ nằm ở failure_reason).
INSERT INTO refunds (transaction_id, amount, reason, created_at)
SELECT t.id, t.amount, COALESCE(t.failure_reason, 'SESSION_CANCELLED'), t.updated_at
  FROM transactions t
 WHERE t.status = 'REFUNDED' AND t.amount > 0
   AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.transaction_id = t.id);

-- 4) Idempotency-Key của POST /api/payment/charge: cùng (người gọi, key) trong 24 giờ → trả kết quả lần đầu.
CREATE TABLE IF NOT EXISTS charge_idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    idem_key        TEXT NOT NULL,
    session_id      UUID NOT NULL,
    transaction_id  UUID REFERENCES transactions(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_charge_idempotency_created ON charge_idempotency_keys (created_at);
