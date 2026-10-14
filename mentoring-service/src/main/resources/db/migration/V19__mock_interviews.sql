-- US-58 (PRD-PREP-1..5, 7) — phỏng vấn thử với mentor: thông tin đặt lịch (intake) + phiếu đánh giá (scorecard).
-- Phiên phỏng vấn thử = phiên session_type = 'MOCK_INTERVIEW' (đặt lịch, thanh toán, ghi chú như phiên thường).

-- Intake mentee điền khi đặt phiên phỏng vấn thử.
CREATE TABLE IF NOT EXISTS mock_intakes (
    session_id      UUID PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    interview_type  TEXT NOT NULL CHECK (interview_type IN ('BACKEND', 'FRONTEND', 'SYSTEM_DESIGN', 'BEHAVIORAL')),
    level           TEXT NOT NULL CHECK (level IN ('INTERN', 'FRESHER', 'JUNIOR')),
    target_role     TEXT NOT NULL CHECK (char_length(target_role) BETWEEN 2 AND 120),
    target_company  TEXT CHECK (target_company IS NULL OR char_length(target_company) <= 120),
    interview_date  DATE,
    jd_url          TEXT CHECK (jd_url IS NULL OR char_length(jd_url) <= 500)
);

-- Phiếu đánh giá mentor điền sau phiên (§6.5): 4 tiêu chí chung 0–10, live coding tuỳ chọn, kết luận, đúng 3 điểm cần sửa
-- (thành 3 việc cần làm của mentee), ghi chú riêng cho mentee. Chỉ mentee và mentor của phiên xem được (Q66).
CREATE TABLE IF NOT EXISTS mock_scorecards (
    session_id      UUID PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    mentor_id       UUID NOT NULL,
    mentee_id       UUID NOT NULL,
    interview_type  TEXT NOT NULL CHECK (interview_type IN ('BACKEND', 'FRONTEND', 'SYSTEM_DESIGN', 'BEHAVIORAL')),
    technical       INTEGER NOT NULL CHECK (technical BETWEEN 0 AND 10),
    problem_solving INTEGER NOT NULL CHECK (problem_solving BETWEEN 0 AND 10),
    depth           INTEGER NOT NULL CHECK (depth BETWEEN 0 AND 10),
    communication   INTEGER NOT NULL CHECK (communication BETWEEN 0 AND 10),
    live_coding     INTEGER CHECK (live_coding IS NULL OR live_coding BETWEEN 0 AND 10),
    overall         NUMERIC(4, 2) NOT NULL CHECK (overall BETWEEN 0 AND 10),
    verdict         TEXT NOT NULL CHECK (verdict IN ('STRONG_HIRE', 'HIRE', 'LEAN_NO', 'NO_HIRE')),
    fixes           TEXT[] NOT NULL CHECK (cardinality(fixes) = 3),
    private_note    TEXT CHECK (private_note IS NULL OR char_length(private_note) <= 2000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mock_scorecards_mentee ON mock_scorecards (mentee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mock_scorecards_mentor ON mock_scorecards (mentor_id);

-- PRD-PREP-2 — nhắc mentor 12 giờ / 36 giờ sau giờ kết thúc; 48 giờ chưa có phiếu → đánh dấu "thiếu phiếu đánh giá"
-- (hạ thứ hạng phỏng vấn thử của mentor; thu nhập vẫn giải phóng 48 giờ như mọi phiên).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scorecard_reminder_12h_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scorecard_reminder_36h_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scorecard_missing_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sessions_mock_scorecard_due ON sessions (scheduled_at)
    WHERE session_type = 'MOCK_INTERVIEW' AND scorecard_missing_at IS NULL;
