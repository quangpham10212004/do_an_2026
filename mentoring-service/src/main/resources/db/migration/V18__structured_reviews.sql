-- US-41 (PRD-REV-1..5) — đánh giá có cấu trúc.
-- reviews: 3 điểm thành phần (kiến thức, truyền đạt, chuẩn bị — NULL ở đánh giá cũ), thẻ, sửa trong 48 giờ,
-- 1 phản hồi công khai của mentor (≤ 500 ký tự).
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS knowledge   INTEGER CHECK (knowledge IS NULL OR knowledge BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS clarity     INTEGER CHECK (clarity IS NULL OR clarity BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS preparation INTEGER CHECK (preparation IS NULL OR preparation BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS tags        TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mentor_reply TEXT CHECK (mentor_reply IS NULL OR char_length(mentor_reply) <= 500),
    ADD COLUMN IF NOT EXISTS mentor_replied_at TIMESTAMPTZ;

-- PRD-REV-4 — mentor nhận xét riêng về mentee sau phiên (không công khai); chỉ dùng tổng hợp thành huy hiệu
-- "đáng tin cậy" cho các mentor sau.
CREATE TABLE IF NOT EXISTS mentee_feedback (
    session_id  UUID PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    mentor_id   UUID NOT NULL,
    mentee_id   UUID NOT NULL,
    preparation INTEGER NOT NULL CHECK (preparation BETWEEN 1 AND 5),
    engagement  INTEGER NOT NULL CHECK (engagement BETWEEN 1 AND 5),
    comment     TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentee_feedback_mentee ON mentee_feedback (mentee_id);
