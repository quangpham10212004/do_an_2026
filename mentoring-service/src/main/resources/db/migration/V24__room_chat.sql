CREATE TABLE room_chat_messages (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    body VARCHAR(500) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX room_chat_messages_recent ON room_chat_messages (session_id, sent_at DESC, id DESC);
