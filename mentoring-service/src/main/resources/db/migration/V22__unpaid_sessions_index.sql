-- Trần phiên PENDING chưa thanh toán của mỗi mentee (app.booking.max-unpaid-per-mentee): đếm theo mentee.
CREATE INDEX IF NOT EXISTS idx_sessions_mentee_pending ON sessions (mentee_id) WHERE status = 'PENDING';
