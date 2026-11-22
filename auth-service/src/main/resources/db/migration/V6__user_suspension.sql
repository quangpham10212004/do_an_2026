ALTER TABLE users ADD COLUMN suspended_until TIMESTAMPTZ;
CREATE INDEX idx_users_suspension_expiry ON users (suspended_until) WHERE suspended_until IS NOT NULL;
