-- Migration cho payment_db đã có dữ liệu: thanh toán gói buổi và hoàn tiền một phần.
-- Chạy: docker compose exec -T payment-db psql -U postgres -d payment_db < db/migrations/2026-10-booking-v2-payment.sql
-- Idempotent: chạy lại nhiều lần không lỗi.

BEGIN;

ALTER TABLE transactions ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'));
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_target_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_target_check CHECK (num_nonnulls(session_id, package_id) = 1);
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_refunded_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_refunded_check CHECK (refunded_amount >= 0 AND refunded_amount <= amount);

CREATE INDEX IF NOT EXISTS idx_transactions_package ON transactions (package_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_package_success
    ON transactions (package_id) WHERE status IN ('SUCCESS', 'PARTIALLY_REFUNDED');

COMMIT;
