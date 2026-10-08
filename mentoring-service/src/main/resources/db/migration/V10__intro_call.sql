-- Buổi làm quen (intro call) trước khi mentor nhận hẳn một mentee.
-- Yêu cầu: PENDING → INTRO (mentor muốn trò chuyện ngắn trước) → ACCEPTED (cả hai bấm "tiếp tục") | REJECTED (một bên từ chối)
-- | CANCELLED (mentee huỷ). INTRO không chiếm sức chứa của mentor — chỉ ACCEPTED mới tính (countActiveMentees).
ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_status_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_status_check
    CHECK (status IN ('PENDING', 'INTRO', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'));

-- Quyết định sau buổi làm quen của từng bên (NULL = chưa quyết định).
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS mentee_decision TEXT
    CHECK (mentee_decision IN ('CONTINUE', 'DECLINE'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS mentor_decision TEXT
    CHECK (mentor_decision IN ('CONTINUE', 'DECLINE'));

-- Loại phiên: REGULAR (có phí, theo giá của mentor) hoặc INTRO (miễn phí, ngắn, gắn với yêu cầu đang INTRO).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'REGULAR'
    CHECK (kind IN ('REGULAR', 'INTRO'));
CREATE INDEX IF NOT EXISTS idx_sessions_request_kind ON sessions (request_id, kind);
CREATE INDEX IF NOT EXISTS idx_requests_mentor_intro ON mentoring_requests (mentor_id) WHERE status = 'INTRO';
