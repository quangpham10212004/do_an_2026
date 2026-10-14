-- US-56 (PRD-PAY-9..14) — thanh toán qua cổng chuyển hướng (MoMo test, VNPay sandbox): chuyển người dùng sang trang của cổng,
-- kết quả về qua IPN (server → server) hoặc truy vấn trạng thái. provider_reference giữ mã giao dịch phía cổng
-- (MoMo transId / vnp_TransactionNo) — cần cho truy vấn / hoàn tiền.
-- provider_txn_ref    = mã đơn gửi sang cổng (MoMo orderId "MH…", vnp_TxnRef), duy nhất.
-- provider_created_at = thời điểm tạo (yyyyMMddHHmmss, GMT+7) — VNPay querydr/refund gửi lại làm vnp_TransactionDate.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_txn_ref TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_created_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_provider_txn_ref ON transactions (provider_txn_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_pending ON transactions (provider, created_at) WHERE status = 'PENDING';

-- PRD-PAY-11 — mọi IPN được ghi nguyên văn (kể cả chữ ký sai) để đối soát / điều tra.
CREATE TABLE IF NOT EXISTS payment_ipn_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider     TEXT NOT NULL,
    txn_ref      TEXT,
    query        TEXT NOT NULL,
    result       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_ipn_log_txn_ref ON payment_ipn_log (txn_ref);
