-- US-34 (PRD-SES-14) — nhắc lịch 24 giờ và 1 giờ trước giờ bắt đầu. Thay cờ reminder_sent (1 lần nhắc) bằng 2 mốc đã gửi.
-- Phiên đã được nhắc theo cơ chế cũ coi như đã nhận cả hai lần nhắc để không bị nhắc lại.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ;

UPDATE sessions SET reminder_24h_sent_at = now(), reminder_1h_sent_at = now()
WHERE reminder_sent = true AND reminder_24h_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_reminders ON sessions (scheduled_at)
    WHERE status = 'CONFIRMED' AND (reminder_24h_sent_at IS NULL OR reminder_1h_sent_at IS NULL);
