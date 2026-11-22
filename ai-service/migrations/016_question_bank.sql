CREATE TABLE question_bank_topics (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL
);
CREATE UNIQUE INDEX question_bank_topic_name ON question_bank_topics (lower(name));

CREATE TABLE question_bank_questions (
    id UUID PRIMARY KEY,
    topic_id UUID NOT NULL REFERENCES question_bank_topics(id),
    content JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX question_bank_questions_by_topic ON question_bank_questions (topic_id, updated_at DESC);

CREATE TABLE question_bank_rules (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    settings JSONB NOT NULL
);
