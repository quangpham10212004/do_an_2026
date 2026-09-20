-- mentoring-service database init (mentoring_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)

-- ---------- Mentoring workflow (FR-5.x) ----------

CREATE TABLE IF NOT EXISTS mentoring_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id     UUID NOT NULL,
    mentor_id     UUID NOT NULL,
    message       TEXT,
    status        TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
    response_note TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_requests_mentor ON mentoring_requests (mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_mentee ON mentoring_requests (mentee_id, status);

CREATE TABLE IF NOT EXISTS sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id        UUID REFERENCES mentoring_requests(id),
    mentee_id         UUID NOT NULL,
    mentor_id         UUID NOT NULL,
    scheduled_at      TIMESTAMPTZ NOT NULL,
    duration_minutes  INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 240),
    price             NUMERIC(12,2) NOT NULL DEFAULT 0,
    topic             TEXT,
    status            TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
    reminder_sent     BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_mentor_time ON sessions (mentor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_mentee ON sessions (mentee_id);

CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID UNIQUE NOT NULL REFERENCES sessions(id),
    mentee_id   UUID NOT NULL,
    mentor_id   UUID NOT NULL,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_mentor ON reviews (mentor_id);

-- Thông báo trong ứng dụng (FR-5.5). recipient_id NULL + recipient_role = 'ADMIN'
-- nghĩa là thông báo gửi cho toàn bộ admin.
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id    UUID,
    recipient_role  TEXT,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    link            TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, created_at DESC);

-- Dữ liệu của 3 tính năng AI (AI Interview, CV Parsing, Chatbot enrichment) nằm ở
-- CSDL riêng của ai-service — xem db/init/ai-service.sql.
