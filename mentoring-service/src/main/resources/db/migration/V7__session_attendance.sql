-- US-12 (PRD-SES-7/8) — xác nhận tham dự sau phiên, thay cho tự hoàn thành sau 2 giờ.
-- Trạng thái phiên: PENDING → CONFIRMED → AWAITING_ATTENDANCE (tới giờ kết thúc) → COMPLETED | NO_SHOW_MENTEE |
-- NO_SHOW_MENTOR | DISPUTED | CANCELLED (cả hai/một bên báo "huỷ trong buổi gọi"); PENDING quá 30 phút chưa thanh toán
-- → EXPIRED (trước đây là CANCELLED + cancel_reason PAYMENT_TIMEOUT).
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check CHECK (status IN (
    'PENDING', 'CONFIRMED', 'AWAITING_ATTENDANCE', 'COMPLETED', 'EXPIRED', 'CANCELLED',
    'NO_SHOW_MENTEE', 'NO_SHOW_MENTOR', 'DISPUTED'));

-- Phiên đã bị hệ thống huỷ vì quá hạn thanh toán (Sprint 1 ghi cancel_reason = PAYMENT_TIMEOUT) → EXPIRED.
-- Phiên huỷ trước Sprint 1 không có cancel_reason nên không phân biệt được → giữ CANCELLED.
UPDATE sessions SET status = 'EXPIRED' WHERE status = 'CANCELLED' AND cancel_reason = 'PAYMENT_TIMEOUT';

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mentee_attendance TEXT
    CHECK (mentee_attendance IN ('HELD', 'MENTOR_NO_SHOW', 'MENTEE_NO_SHOW', 'CANCELLED_ON_CALL'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mentor_attendance TEXT
    CHECK (mentor_attendance IN ('HELD', 'MENTOR_NO_SHOW', 'MENTEE_NO_SHOW', 'CANCELLED_ON_CALL'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mentee_attended_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mentor_attended_at TIMESTAMPTZ;
-- Cách phiên được kết luận (BOTH_HELD, HELD_ONE_SIDE, NO_ANSWER, MENTEE_NO_SHOW_REPORTED, MENTOR_NO_SHOW_REPORTED,
-- CONFLICT, CANCELLED_ON_CALL) và thời điểm kết luận. Phiên COMPLETED trước US-12 để NULL.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS attendance_resolution TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_status_start ON sessions (status, scheduled_at);

-- Outbox: thêm hoàn tiền (NO_SHOW_MENTOR, CANCELLED_ON_CALL) và tạm giữ giao dịch (DISPUTED).
ALTER TABLE payment_outbox DROP CONSTRAINT IF EXISTS payment_outbox_kind_check;
ALTER TABLE payment_outbox ADD CONSTRAINT payment_outbox_kind_check CHECK (kind IN ('REWARD', 'REFUND', 'HOLD'));
CREATE INDEX IF NOT EXISTS idx_payment_outbox_session_unsent ON payment_outbox (session_id) WHERE sent_at IS NULL;
