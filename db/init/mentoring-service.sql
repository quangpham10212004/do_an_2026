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

-- ---------- AI Interview (FR-7.x) — phần AI nằm ở ai-service, bảng này lưu trạng thái ----------

CREATE TABLE IF NOT EXISTS interviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id       UUID NOT NULL,
    domain          TEXT NOT NULL,
    skills          TEXT[] NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    max_turns       INTEGER NOT NULL,
    current_turn    INTEGER NOT NULL DEFAULT 1,
    engine          TEXT NOT NULL,                      -- DEEPSEEK | RULE_BASED (ai-service)
    overall_score   REAL,                               -- thang 0-100
    summary         TEXT,
    strengths       TEXT,
    weaknesses      TEXT,
    recommendation  TEXT CHECK (recommendation IN ('APPROVE', 'REJECT', 'NEEDS_REVIEW')),
    reviewed_by     UUID,
    review_note     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_interviews_mentor ON interviews (mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews (status);

CREATE TABLE IF NOT EXISTS interview_turns (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    turn_no       INTEGER NOT NULL,
    topic         TEXT NOT NULL,
    strategy      TEXT NOT NULL CHECK (strategy IN ('OPENING', 'DEEPEN', 'PIVOT')),
    question      TEXT NOT NULL,
    answer        TEXT,
    score         REAL,                                 -- thang 0-10
    feedback      TEXT,
    asked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at   TIMESTAMPTZ,
    UNIQUE (interview_id, turn_no)
);

-- ---------- CV Parsing + Chatbot enrichment (FR-8.x) ----------

CREATE TABLE IF NOT EXISTS cv_documents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    file_name         TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    raw_text          TEXT NOT NULL,
    parsed_json       TEXT NOT NULL,                    -- ParsedCv serialize JSON
    engine            TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_documents_user ON cv_documents (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS enrichment_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id       UUID NOT NULL,
    cv_id           UUID NOT NULL REFERENCES cv_documents(id),
    status          TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    max_turns       INTEGER NOT NULL,
    current_turn    INTEGER NOT NULL DEFAULT 1,
    engine          TEXT NOT NULL,
    enriched_goal   TEXT,
    profile_synced  BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS enrichment_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES enrichment_conversations(id) ON DELETE CASCADE,
    turn_no          INTEGER NOT NULL,
    slot             TEXT NOT NULL,                     -- thông tin cần làm rõ (TARGET_ROLE, TIMELINE...)
    question         TEXT NOT NULL,
    answer           TEXT,
    asked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at      TIMESTAMPTZ,
    UNIQUE (conversation_id, turn_no)
);
