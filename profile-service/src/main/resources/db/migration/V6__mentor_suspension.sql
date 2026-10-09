-- US-27 (PRD-ADM-3) — admin tạm ngưng (đình chỉ) mentor. Tách khỏi khoá tài khoản ở auth-service:
-- mentor vẫn đăng nhập được, chỉ không được gợi ý / nhận yêu cầu / nhận đặt lịch mới.
--   suspended_reason  lý do admin nhập (10–500 ký tự, kiểm tra ở API) hoặc lý do của luồng tranh chấp (DISPUTE)
--   suspended_at      thời điểm bị đình chỉ
--   suspended_by      admin thực hiện (NULL = hệ thống, vd. mentoring-service sau tranh chấp)
-- Gỡ đình chỉ (về ACCEPTING) xoá cả 3 cột; lịch sử nằm ở audit log (auth-service, US-30).
-- Không thêm CHECK (status = 'SUSPENDED' => suspended_at NOT NULL): dữ liệu test/seed cũ đặt status bằng SQL thô.
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_by UUID;

-- Mentor đã SUSPENDED trước migration (qua Interface 2) — giữ lý do cũ làm lý do đình chỉ.
UPDATE mentor_profiles
   SET suspended_reason = COALESCE(status_reason, 'Đình chỉ trước khi có US-27'),
       suspended_at = COALESCE(status_changed_at, now())
 WHERE status = 'SUSPENDED' AND suspended_at IS NULL;

-- Trang /admin/mentors lọc theo trạng thái.
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_status ON mentor_profiles (status);
