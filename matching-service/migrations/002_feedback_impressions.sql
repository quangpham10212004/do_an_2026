-- 002 — US-36 (PRD-MATCH-6, PRD-MATCH-8): phản hồi "Không phù hợp" và nhật ký hiển thị kết quả.
--
-- match_feedback: mentee bấm "Không phù hợp" trên thẻ mentor → mentor bị ẩn khỏi gợi ý của mentee đó tới hidden_until
-- (30 ngày). revoked_at = mentee tự bỏ ẩn sớm. Lý do + hạng lúc bấm được giữ để đánh giá offline (mục 6 PRD).
CREATE TABLE IF NOT EXISTS match_feedback (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id     UUID NOT NULL,
    mentor_id     UUID NOT NULL,
    reason        TEXT NOT NULL CHECK (reason IN ('WRONG_DOMAIN', 'TOO_EXPENSIVE', 'SCHEDULE', 'OTHER')),
    note          TEXT CHECK (note IS NULL OR char_length(note) <= 300),
    impression_id UUID,
    rank          INTEGER CHECK (rank IS NULL OR rank >= 1),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    hidden_until  TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_match_feedback_active ON match_feedback (mentee_id, hidden_until) WHERE revoked_at IS NULL;

-- match_impressions: mỗi lần trả danh sách gợi ý ghi 1 dòng / mentor (cùng impression_id): hạng, điểm và từng phần
-- điểm, bộ lọc, trọng số — để tính Precision@K và tỉ lệ được gửi yêu cầu theo hạng.
CREATE TABLE IF NOT EXISTS match_impressions (
    id            BIGSERIAL PRIMARY KEY,
    impression_id UUID NOT NULL,
    mentee_id     UUID NOT NULL,
    mentor_id     UUID NOT NULL,
    rank          INTEGER NOT NULL CHECK (rank >= 1),
    final_score   REAL NOT NULL,
    score_parts   JSONB NOT NULL DEFAULT '{}'::jsonb,
    filters       JSONB NOT NULL DEFAULT '{}'::jsonb,
    weights       JSONB NOT NULL DEFAULT '{}'::jsonb,
    model         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_impressions_mentee ON match_impressions (mentee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_match_impressions_impression ON match_impressions (impression_id);
