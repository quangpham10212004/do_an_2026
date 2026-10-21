-- Bản chốt v2.0 §8 — ví VND: tiền nạp (CASH) + tiền khuyến mãi (PROMO, theo lô có hạn), số dư = tổng bút toán.
--
-- wallets              : trạng thái ví (ACTIVE | DORMANT | FROZEN) và mốc hoạt động cuối (12 tháng không giao dịch → DORMANT).
-- wallet_entries       : sổ cái APPEND-ONLY; KHÔNG có cột số dư. Số dư tiền nạp khả dụng = SUM(amount) với bucket = 'CASH'.
--                        idempotency_key UNIQUE chống ghi trùng (IPN lặp, retry).
-- wallet_promo_lots    : mỗi khoản khuyến mãi một lô, hết hạn sau 12 tháng; dùng lô sắp hết hạn trước. Số dư khuyến mãi
--                        khả dụng = SUM(remaining) của lô chưa hết hạn. (Là trạng thái, không phải sổ cái → được UPDATE.)
-- wallet_allocations   : lô khuyến mãi nào đã trả cho giao dịch nào — để hoàn tiền về đúng lô.
-- topup_refund_requests: yêu cầu hoàn tiền nạp về nguồn (ngoại lệ do admin xử lý).
-- transactions.kind    : SESSION = trả học phí; TOPUP = nạp ví qua cổng (tái dùng toàn bộ luồng IPN / truy vấn / hoàn tiền của cổng).
--                        paid_promo / paid_cash = phần học phí lấy từ khuyến mãi / tiền nạp (provider = 'WALLET').

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'SESSION' CHECK (kind IN ('SESSION', 'TOPUP'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_promo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_promo >= 0);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_cash  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_cash >= 0);
UPDATE transactions SET paid_cash = amount WHERE kind = 'SESSION' AND paid_cash = 0 AND paid_promo = 0 AND status <> 'FAILED';

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_fee_split_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_fee_split_check
    CHECK (kind <> 'SESSION' OR (fee >= 0 AND mentor_earning >= 0 AND fee + mentor_earning = amount));
CREATE INDEX IF NOT EXISTS idx_transactions_topup ON transactions (payer_id, created_at DESC) WHERE kind = 'TOPUP';

CREATE TABLE IF NOT EXISTS wallets (
    user_id           UUID PRIMARY KEY,
    status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DORMANT', 'FROZEN')),
    last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    dormant_notified_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_promo_lots (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    granted      NUMERIC(12,2) NOT NULL CHECK (granted > 0),
    remaining    NUMERIC(12,2) NOT NULL CHECK (remaining >= 0 AND remaining <= granted),
    expires_at   TIMESTAMPTZ NOT NULL,
    reason       TEXT NOT NULL,
    ref          TEXT,
    notified_30d_at TIMESTAMPTZ,
    notified_7d_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_promo_lots_user ON wallet_promo_lots (user_id, expires_at) WHERE remaining > 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_promo_lots_ref ON wallet_promo_lots (user_id, reason, ref) WHERE ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL,
    kind             TEXT NOT NULL CHECK (kind IN ('TOPUP', 'HOLD', 'REFUND_TO_WALLET', 'TOPUP_REFUND', 'PROMO_GRANT', 'PROMO_EXPIRE', 'ADJUST')),
    bucket           TEXT NOT NULL CHECK (bucket IN ('CASH', 'PROMO')),
    amount           NUMERIC(12,2) NOT NULL CHECK (amount <> 0),   -- có dấu: + cộng vào khả dụng, − trừ khỏi khả dụng
    session_id       UUID,
    transaction_id   UUID REFERENCES transactions(id),
    lot_id           UUID REFERENCES wallet_promo_lots(id),
    idempotency_key  TEXT UNIQUE,
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_cash ON wallet_entries (user_id) WHERE bucket = 'CASH';

CREATE OR REPLACE FUNCTION wallet_entries_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'wallet_entries is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_wallet_entries_append_only ON wallet_entries;
CREATE TRIGGER trg_wallet_entries_append_only BEFORE UPDATE OR DELETE ON wallet_entries
    FOR EACH ROW EXECUTE FUNCTION wallet_entries_append_only();

CREATE TABLE IF NOT EXISTS wallet_allocations (
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    lot_id          UUID NOT NULL REFERENCES wallet_promo_lots(id),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    refunded        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refunded >= 0 AND refunded <= amount),
    PRIMARY KEY (transaction_id, lot_id)
);

CREATE TABLE IF NOT EXISTS topup_refund_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'REJECTED')),
    kind          TEXT NOT NULL DEFAULT 'AUTO' CHECK (kind IN ('AUTO', 'EXCEPTION')),
    user_reason   TEXT,
    admin_id      UUID,
    admin_reason  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_topup_refund_requests_user ON topup_refund_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_refund_requests_pending ON topup_refund_requests (created_at) WHERE status = 'PENDING';
