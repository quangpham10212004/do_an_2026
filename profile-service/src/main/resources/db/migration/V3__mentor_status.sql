-- US-08 (PRD-PROF-5) — thay cờ is_available bằng trạng thái nhận mentee:
--   ACCEPTING  đang nhận mentee
--   PAUSED     tạm ngưng (mentor tự bật, hoặc mentoring-service sau 3 lần vi phạm)
--   ON_LEAVE   nghỉ phép tới hết ngày on_leave_until (giờ của mentor), sau đó tự về ACCEPTING
--   SUSPENDED  bị đình chỉ — chỉ ADMIN (US-27) hoặc mentoring-service (tranh chấp) đặt được
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACCEPTING'
        CHECK (status IN ('ACCEPTING', 'PAUSED', 'ON_LEAVE', 'SUSPENDED')),
    ADD COLUMN IF NOT EXISTS on_leave_until DATE,
    ADD COLUMN IF NOT EXISTS status_reason TEXT,
    ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Chuyển dữ liệu cũ: true -> ACCEPTING, false -> PAUSED.
UPDATE mentor_profiles SET status = CASE WHEN is_available THEN 'ACCEPTING' ELSE 'PAUSED' END;

ALTER TABLE mentor_profiles
    ADD CONSTRAINT mentor_profiles_on_leave_until_required
        CHECK (status <> 'ON_LEAVE' OR on_leave_until IS NOT NULL);

-- Tương thích: is_available vẫn đọc được (matching-service bản cũ, truy vấn tay) nhưng giờ là cột
-- sinh tự động, không ghi được. Lưu ý: ON_LEAVE đã hết hạn vẫn là false cho tới khi
-- MentorStatusJob chuyển về ACCEPTING (vài phút); code mới tính trạng thái hiệu lực từ status.
-- Grant SELECT của matching_reader ở mức bảng nên vẫn đọc được các cột mới.
ALTER TABLE mentor_profiles DROP COLUMN is_available;
ALTER TABLE mentor_profiles
    ADD COLUMN is_available BOOLEAN GENERATED ALWAYS AS (status = 'ACCEPTING') STORED;

CREATE INDEX IF NOT EXISTS idx_mentor_profiles_on_leave
    ON mentor_profiles (on_leave_until) WHERE status = 'ON_LEAVE';
