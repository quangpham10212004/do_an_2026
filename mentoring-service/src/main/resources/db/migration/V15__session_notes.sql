-- US-40 (PRD-SES-10..12) — ghi chú phiên.
-- session_notes: ghi chú chung dạng markdown, cả hai bên sửa (autosave); version tăng mỗi lần lưu để phát hiện ghi đè
-- khi hai người sửa cùng lúc (PUT kèm baseVersion, lệch → 409).
CREATE TABLE IF NOT EXISTS session_notes (
    session_id UUID PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    content    TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 20000),
    version    INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Action item: gắn với phiên tạo ra nó, nhưng thuộc về CẶP mentor–mentee — việc còn mở được mang sang trang phiên
-- kế tiếp và không gian mentoring của cặp.
CREATE TABLE IF NOT EXISTS action_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    mentee_id  UUID NOT NULL,
    mentor_id  UUID NOT NULL,
    text       TEXT NOT NULL CHECK (char_length(text) BETWEEN 2 AND 300),
    owner      TEXT NOT NULL CHECK (owner IN ('MENTEE', 'MENTOR')),
    due_date   DATE,
    done       BOOLEAN NOT NULL DEFAULT false,
    done_at    TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_pair ON action_items (mentee_id, mentor_id, done, created_at);
CREATE INDEX IF NOT EXISTS idx_action_items_session ON action_items (session_id);

-- Ghi chú riêng của mentor — mentee không bao giờ đọc được.
CREATE TABLE IF NOT EXISTS mentor_private_notes (
    session_id UUID PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    mentor_id  UUID NOT NULL,
    content    TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 10000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
