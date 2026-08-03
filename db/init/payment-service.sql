CREATE TABLE IF NOT EXISTS transactions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    amount     NUMERIC(12,2) NOT NULL,
    status     TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('SUCCESS','FAILED','PENDING')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
