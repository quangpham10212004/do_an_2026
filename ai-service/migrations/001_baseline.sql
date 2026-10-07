-- ai-service database init (ai_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)
--
-- ai-service sở hữu toàn bộ dữ liệu của 3 tính năng AI (AI Interview, CV Parsing,
-- Chatbot enrichment). Trước đây các bảng này nằm trong mentoring_db và luồng nghiệp vụ
-- do mentoring-service (Java) điều phối; nay cả luồng lẫn dữ liệu đều thuộc ai-service.

-- ---------- AI Interview (FR-7.x) ----------

CREATE TABLE IF NOT EXISTS interviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id       UUID NOT NULL,
    domain          TEXT NOT NULL,
    skills          TEXT[] NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    max_turns       INTEGER NOT NULL,
    current_turn    INTEGER NOT NULL DEFAULT 1,
    engine          TEXT NOT NULL,                      -- DEEPSEEK | RULE_BASED
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
    parsed_json       JSONB NOT NULL,                   -- ParsedCv serialize JSON
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

CREATE INDEX IF NOT EXISTS idx_conversations_mentee ON enrichment_conversations (mentee_id, created_at DESC);

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
