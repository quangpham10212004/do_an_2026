CREATE TABLE conversation_mutes (
    conversation_id UUID NOT NULL REFERENCES mentoring_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE message_presence (
    user_id UUID PRIMARY KEY,
    last_seen_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE conversation_attachments (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES mentoring_requests(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL,
    name VARCHAR(240) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversation_attachments_recent ON conversation_attachments(conversation_id, created_at DESC);
CREATE INDEX conversation_attachments_uploader ON conversation_attachments(uploader_id, created_at DESC);
