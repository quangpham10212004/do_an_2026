-- Thanh toán gói buổi: một giao dịch có thể thuộc về một phiên (session_id) HOẶC một gói (package_id), không cả hai.
ALTER TABLE transactions ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_target_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_target_check CHECK (num_nonnulls(session_id, package_id) = 1);
CREATE INDEX IF NOT EXISTS idx_transactions_package ON transactions (package_id) WHERE package_id IS NOT NULL;

-- Tối đa 1 giao dịch "đã thu tiền" cho mỗi gói (cùng quy tắc với phiên, xem uq_transactions_session_paid)
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_package_paid
    ON transactions (package_id) WHERE package_id IS NOT NULL AND status IN ('SUCCESS', 'ON_HOLD', 'PARTIALLY_REFUNDED');

-- Idempotency-Key của charge cũng cần nhận diện mục tiêu là gói
ALTER TABLE charge_idempotency_keys ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE charge_idempotency_keys ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE charge_idempotency_keys DROP CONSTRAINT IF EXISTS charge_idempotency_keys_target_check;
ALTER TABLE charge_idempotency_keys ADD CONSTRAINT charge_idempotency_keys_target_check
    CHECK (num_nonnulls(session_id, package_id) = 1);
