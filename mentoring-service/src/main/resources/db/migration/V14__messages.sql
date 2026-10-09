-- US-33 (PRD-MSG-1..4) — nhắn tin trong yêu cầu / quan hệ mentoring. Mỗi yêu cầu có đúng 1 cuộc trò chuyện
-- (conversation_id = mentoring_requests.id), mở ngay khi yêu cầu được gửi.
-- Nội dung lưu nguyên văn; số điện thoại / email chỉ được che khi trả về API (trước phiên trả phí đầu tiên).
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES mentoring_requests (id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL,
    sender_role     TEXT NOT NULL CHECK (sender_role IN ('MENTEE', 'MENTOR')),
    body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

-- Mốc "đã đọc tới" của từng người trong từng cuộc trò chuyện — đếm tin chưa đọc = tin của bên kia sau mốc này.
CREATE TABLE IF NOT EXISTS conversation_reads (
    conversation_id UUID NOT NULL REFERENCES mentoring_requests (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    last_read_at    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

-- PRD-MSG-4 — báo cáo tin nhắn = 1 hồ sơ kiểm duyệt. Người kiểm duyệt (ADMIN) chỉ xem được nội dung cuộc trò
-- chuyện khi hồ sơ còn OPEN.
CREATE TABLE IF NOT EXISTS message_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES mentoring_requests (id) ON DELETE CASCADE,
    reporter_id     UUID NOT NULL,
    reason          TEXT NOT NULL CHECK (reason IN ('SPAM', 'HARASSMENT', 'OFF_PLATFORM_PAYMENT', 'OTHER')),
    note            TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    outcome         TEXT CHECK (outcome IS NULL OR outcome IN ('DISMISSED', 'WARNED')),
    resolution_note TEXT,
    resolved_by     UUID,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Một người chỉ báo cáo 1 tin nhắn một lần khi hồ sơ còn mở.
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_reports_open
    ON message_reports (message_id, reporter_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON message_reports (status, created_at);
