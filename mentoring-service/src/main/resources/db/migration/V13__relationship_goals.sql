-- US-28 (PRD-REQ-5) — không gian mentoring (relationship workspace). Quan hệ = yêu cầu mentoring đã được
-- chấp nhận (relationship_id = mentoring_requests.id). Mỗi quan hệ có 1–5 mục tiêu (giới hạn kiểm tra ở API,
-- dưới khoá advisory theo quan hệ); mục tiêu đầu tiên được tạo tự động từ goal của yêu cầu khi workspace được
-- mở lần đầu (created_by NULL = hệ thống). Team B sở hữu bảng này; Team A sở hữu mentoring_requests.
CREATE TABLE IF NOT EXISTS relationship_goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relationship_id UUID NOT NULL REFERENCES mentoring_requests (id) ON DELETE CASCADE,
    text            TEXT NOT NULL CHECK (char_length(text) BETWEEN 5 AND 300),
    status          TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    position        INTEGER NOT NULL CHECK (position >= 0),
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relationship_goals_relationship ON relationship_goals (relationship_id, position);
