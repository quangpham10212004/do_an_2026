-- mentoring-service database init (mentoring_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)

-- ---------- Mentoring workflow (FR-5.x) ----------

CREATE TABLE IF NOT EXISTS mentoring_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id     UUID NOT NULL,
    mentor_id     UUID NOT NULL,
    message       TEXT,
    status        TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'INTRO', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
    response_note TEXT,
    -- Sau buổi làm quen (status = INTRO): mỗi bên chọn CONTINUE/DECLINE; cả hai CONTINUE thì thành ACCEPTED
    mentee_decision TEXT CHECK (mentee_decision IN ('CONTINUE', 'DECLINE')),
    mentor_decision TEXT CHECK (mentor_decision IN ('CONTINUE', 'DECLINE')),
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
    session_type      TEXT NOT NULL DEFAULT 'REGULAR' CHECK (session_type IN ('INTRO', 'REGULAR')),
    package_id        UUID,                                -- phiên dùng 1 buổi trong gói (price = 0)
    reschedule_count  INTEGER NOT NULL DEFAULT 0,          -- số lần mentee đã tự đổi lịch
    proposed_at       TIMESTAMPTZ,                         -- đề xuất đổi lịch đang chờ bên kia đồng ý
    proposed_by       UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_mentor_time ON sessions (mentor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_mentee ON sessions (mentee_id);

-- Gói buổi (combo): mentee mua N buổi giá ưu đãi, mỗi lần đặt phiên trừ 1 buổi.
-- PENDING_PAYMENT → ACTIVE → EXHAUSTED | EXPIRED | CANCELLED. Khi EXPIRED/CANCELLED mà còn buổi
-- chưa dùng thì ghi refund_due và đặt refund_pending để job hoàn tiền (thử lại nếu payment-service lỗi).
CREATE TABLE IF NOT EXISTS session_packages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id          UUID NOT NULL,
    mentor_id          UUID NOT NULL,
    request_id         UUID REFERENCES mentoring_requests(id),
    sessions_total     INTEGER NOT NULL CHECK (sessions_total > 0),
    sessions_remaining INTEGER NOT NULL CHECK (sessions_remaining >= 0),
    duration_minutes   INTEGER NOT NULL CHECK (duration_minutes BETWEEN 30 AND 180),
    discount_percent   INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
    unit_price         NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    total_price        NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    status             TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
        CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED')),
    expires_at         TIMESTAMPTZ,
    refund_due         NUMERIC(12,2) NOT NULL DEFAULT 0,
    refund_pending     BOOLEAN NOT NULL DEFAULT false,
    refunded_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packages_mentee ON session_packages (mentee_id, status);
CREATE INDEX IF NOT EXISTS idx_packages_mentor ON session_packages (mentor_id, status);

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
