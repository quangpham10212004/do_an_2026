-- Tuỳ chọn thông báo theo nhóm (trong ứng dụng / email) và nhắc lịch; frontend: features/socialx NotificationPrefs.
CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id UUID PRIMARY KEY,
    prefs JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
