-- auth-service database init (auth_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)

CREATE TABLE IF NOT EXISTS users (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                     TEXT UNIQUE NOT NULL,
    password_hash             TEXT NOT NULL,
    full_name                 TEXT,
    role                      TEXT NOT NULL CHECK (role IN ('MENTOR', 'MENTEE', 'ADMIN')),
    status                    TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED')),
    email_verified            BOOLEAN NOT NULL DEFAULT false,
    email_verification_token  TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (email_verification_token);

-- Refresh token lưu dạng hash SHA-256 (không lưu token gốc) để nếu DB bị lộ
-- thì token cũng không dùng lại được. Mỗi lần refresh sẽ xoay vòng (rotate)
-- token: token cũ bị revoke, token mới được cấp.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
