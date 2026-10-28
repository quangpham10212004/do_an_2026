-- Hoàn tiền nội bộ idempotent: mentoring-service gửi khoá ổn định cho mỗi bản ghi outbox
-- (outbox:<id>); gửi lại cùng khoá thì không tạo khoản hoàn mới.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key TEXT
    CHECK (idempotency_key IS NULL OR char_length(idempotency_key) <= 100);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_tx_idem ON refunds (transaction_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
