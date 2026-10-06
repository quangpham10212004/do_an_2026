-- US-09 (PRD-AUTH-1) — quên mật khẩu.
-- Token gốc (32 byte ngẫu nhiên, base64url) chỉ nằm trong email; DB lưu SHA-256 giống refresh token.
-- Hiệu lực 30 phút, dùng một lần (used_at khác NULL = đã dùng hoặc đã bị thay bằng token mới hơn).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);
