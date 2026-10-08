-- payment-service database init (payment_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)

-- ---------- Thanh toán (FR-6.1 → FR-6.3) ----------

CREATE TABLE IF NOT EXISTS transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID,                              -- thanh toán 1 phiên lẻ
    package_id          UUID,                              -- hoặc thanh toán 1 gói buổi
    payer_id            UUID NOT NULL,
    mentor_id           UUID NOT NULL,
    amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency            TEXT NOT NULL DEFAULT 'VND',
    status              TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
    provider            TEXT NOT NULL DEFAULT 'SANDBOX',
    provider_reference  TEXT,
    failure_reason      TEXT,
    refunded_amount     NUMERIC(12,2) NOT NULL DEFAULT 0, -- hoàn một phần khi gói còn buổi chưa dùng
    session_synced      BOOLEAN NOT NULL DEFAULT false,   -- đã báo mentoring-service xác nhận phiên/gói
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(session_id, package_id) = 1),
    CHECK (refunded_amount >= 0 AND refunded_amount <= amount)
);

CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions (session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payer ON transactions (payer_id, created_at DESC);

-- Chỉ cho phép tối đa 1 giao dịch SUCCESS cho mỗi session (chống thanh toán trùng)
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_session_success
    ON transactions (session_id) WHERE status = 'SUCCESS';

CREATE INDEX IF NOT EXISTS idx_transactions_package ON transactions (package_id);

-- Tương tự cho gói buổi (giao dịch gói đã hoàn một phần vẫn tính là đã thanh toán)
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_package_success
    ON transactions (package_id) WHERE status IN ('SUCCESS', 'PARTIALLY_REFUNDED');

-- ---------- Referral / Affiliate (FR-6.4 → FR-6.6) ----------

CREATE TABLE IF NOT EXISTS referral_codes (
    user_id     UUID PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id       UUID NOT NULL,
    referee_id        UUID UNIQUE NOT NULL,             -- mỗi người chỉ được giới thiệu 1 lần
    code              TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'REGISTERED'
        CHECK (status IN ('REGISTERED', 'QUALIFIED', 'REJECTED')),
    reject_reason     TEXT,
    qualifying_tx_id  UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    qualified_at      TIMESTAMPTZ,
    CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id);

-- Sổ cái điểm thưởng (ledger): số dư = SUM(points). Ghi nhận append-only để
-- truy vết được mọi lần cộng điểm.
CREATE TABLE IF NOT EXISTS reward_ledger (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    points       INTEGER NOT NULL,
    reason       TEXT NOT NULL,
    referral_id  UUID REFERENCES referrals(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_user ON reward_ledger (user_id);
