-- US-31 (PRD-REQ-6) — kết thúc quan hệ mentoring: trạng thái ENDED thay cho COMPLETED.
-- ACCEPTED → ENDED do mentee / mentor (POST /requests/{id}/end, có lý do), admin, hoặc hệ thống (không hoạt động
-- 30 + 7 ngày, reason INACTIVE). COMPLETED vẫn được CHECK chấp nhận để đọc dữ liệu cũ an toàn (code coi như ENDED),
-- nhưng không còn được ghi mới.
ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_status_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'ENDED'));

ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS ended_by TEXT
    CHECK (ended_by IN ('MENTEE', 'MENTOR', 'ADMIN', 'SYSTEM'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS end_reason TEXT
    CHECK (end_reason IN ('GOAL_REACHED', 'NO_LONGER_NEEDED', 'NOT_A_FIT', 'OTHER', 'INACTIVE'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS end_note TEXT CHECK (char_length(end_note) <= 500);
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
-- Đã gửi nhắc "Bạn có muốn tiếp tục?" (30 ngày không hoạt động); đặt lịch phiên mới xoá cờ này.
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS inactivity_warned_at TIMESTAMPTZ;

-- Dữ liệu cũ: COMPLETED → ENDED (không biết ai kết thúc / lúc nào: ended_by NULL, lý do OTHER, ended_at = lúc phản hồi).
UPDATE mentoring_requests
   SET status = 'ENDED', end_reason = 'OTHER', ended_at = COALESCE(responded_at, created_at)
 WHERE status = 'COMPLETED';

CREATE INDEX IF NOT EXISTS idx_requests_accepted ON mentoring_requests (id) WHERE status = 'ACCEPTED';
