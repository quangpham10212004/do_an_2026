-- Bản chốt v2.0 §5–7 — đặt lịch trả từ ví, mentor xác nhận từng buổi, buổi trải nghiệm, nhật ký vào phòng học.
--
-- Trạng thái phiên: PENDING (khung giờ được giữ, ví chưa đủ tiền — tối đa 15 phút) → AWAITING_MENTOR (đã tạm giữ học phí từ ví,
-- chờ mentor xác nhận trong confirm_deadline = min(24 giờ, 1 giờ trước giờ bắt đầu)) → CONFIRMED → ... như cũ.
-- kind: REGULAR (60 phút, giá theo cấp mentor) | TRIAL (15 phút, 30.000đ, mỗi cặp một lần).
-- mentor_joined_at / mentee_joined_at: nhật ký vào phòng học — căn cứ duy nhất xác định vắng mặt.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check CHECK (status IN (
    'PENDING', 'AWAITING_MENTOR', 'CONFIRMED', 'AWAITING_ATTENDANCE', 'COMPLETED', 'EXPIRED', 'CANCELLED',
    'NO_SHOW_MENTEE', 'NO_SHOW_MENTOR', 'DISPUTED'));

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'REGULAR' CHECK (kind IN ('REGULAR', 'TRIAL'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS confirm_deadline TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mentor_joined_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mentee_joined_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_awaiting_mentor ON sessions (confirm_deadline) WHERE status = 'AWAITING_MENTOR';

-- Buổi trải nghiệm: mỗi cặp (mentee, mentor) một lần — kể cả khi buổi bị huỷ sau đó thì vẫn đã dùng lượt (chống lạm dụng);
-- huỷ ≥ 2 giờ trước giờ bắt đầu hoàn lại lượt (xoá dòng) — xem SessionService.
CREATE TABLE IF NOT EXISTS trial_uses (
    mentee_id   UUID NOT NULL,
    mentor_id   UUID NOT NULL,
    session_id  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (mentee_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS idx_trial_uses_mentee ON trial_uses (mentee_id);

-- Lượt vi phạm chia sẻ thông tin liên hệ ngoài nền tảng (tin nhắn luôn được che; 3 lần / 30 ngày báo admin).
CREATE TABLE IF NOT EXISTS contact_violations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    request_id  UUID,
    kinds       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    flagged_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contact_violations_user ON contact_violations (user_id, created_at DESC);
