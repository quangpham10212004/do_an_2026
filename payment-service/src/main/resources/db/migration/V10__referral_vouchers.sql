CREATE TABLE referral_vouchers (
    id UUID PRIMARY KEY REFERENCES mentor_referrals(id),
    owner_id UUID NOT NULL,
    code VARCHAR(24) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_session_id UUID UNIQUE
);
CREATE INDEX referral_vouchers_owner ON referral_vouchers (owner_id, expires_at DESC);
