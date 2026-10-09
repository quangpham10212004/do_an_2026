-- US-38 (PRD-AUTH-2, PRD-NOTI-1..4) — email thông báo.
-- notification_preferences: bật/tắt email theo nhóm (requests, sessions, messages, reviews, marketing — marketing tắt
-- mặc định) + giờ yên tĩnh 22:00–07:00 theo múi giờ người dùng. Chưa có dòng = mặc định. Email bảo mật (đặt lại mật
-- khẩu, xác thực) và kết quả xét duyệt tài khoản không tắt được.
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id     UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    requests    BOOLEAN NOT NULL DEFAULT true,
    sessions    BOOLEAN NOT NULL DEFAULT true,
    messages    BOOLEAN NOT NULL DEFAULT true,
    reviews     BOOLEAN NOT NULL DEFAULT true,
    marketing   BOOLEAN NOT NULL DEFAULT false,
    quiet_hours BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- email_outbox: mọi email thông báo đi qua hàng đợi này; job gửi các dòng PENDING đã tới send_after (giờ yên tĩnh =
-- hoãn tới 07:00). SKIPPED = người dùng tắt nhóm đó (giữ dòng để truy vết). dedupe_key chống gửi trùng một sự kiện.
CREATE TABLE IF NOT EXISTS email_outbox (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    to_email    TEXT NOT NULL,
    category    TEXT NOT NULL CHECK (category IN ('REQUESTS', 'SESSIONS', 'MESSAGES', 'REVIEWS', 'MARKETING', 'ACCOUNT', 'SECURITY')),
    type        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'SKIPPED', 'FAILED')),
    skip_reason TEXT,
    send_after  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    sent_at     TIMESTAMPTZ,
    dedupe_key  TEXT UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_due ON email_outbox (send_after) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_email_outbox_user ON email_outbox (user_id, created_at DESC);
