-- US-38 (PRD-NOTI-2) — email "tin nhắn mới" chỉ gửi khi tin còn chưa đọc sau 30 phút, gộp nhiều tin thành 1 email.
-- last_message_at = mốc tin mới nhất đã được báo qua email cho người này (tin sau mốc mới được gộp vào lần sau).
CREATE TABLE IF NOT EXISTS message_email_digests (
    user_id         UUID PRIMARY KEY,
    last_message_at TIMESTAMPTZ NOT NULL,
    last_sent_at    TIMESTAMPTZ NOT NULL
);
