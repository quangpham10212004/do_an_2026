-- US-14 (PRD-REQ-1/2) — form yêu cầu mentoring + lý do từ chối.
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS session_type TEXT
    CHECK (session_type IN ('CAREER_ADVICE', 'CODE_REVIEW', 'MOCK_INTERVIEW', 'PROJECT_GUIDANCE'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS frequency TEXT
    CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'ONE_OFF'));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS expected_duration_months INTEGER
    CHECK (expected_duration_months IN (1, 3, 6));
ALTER TABLE mentoring_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT
    CHECK (reject_reason IN ('FULL', 'NOT_MY_EXPERTISE', 'SCHEDULE', 'OTHER'));

-- Yêu cầu cũ (trước form): goal lấy từ lời nhắn nếu có, còn lại giá trị mặc định an toàn. Ràng buộc 50–1000 ký tự của
-- goal chỉ áp ở API cho yêu cầu mới.
UPDATE mentoring_requests
   SET goal = COALESCE(NULLIF(BTRIM(message), ''), 'Yêu cầu được gửi trước khi có form mục tiêu (dữ liệu cũ).')
 WHERE goal IS NULL;
UPDATE mentoring_requests SET session_type = 'CAREER_ADVICE' WHERE session_type IS NULL;
UPDATE mentoring_requests SET frequency = 'ONE_OFF' WHERE frequency IS NULL;
UPDATE mentoring_requests SET expected_duration_months = 1 WHERE expected_duration_months IS NULL;
-- Từ chối trước US-14 không có lý do có cấu trúc (ghi chú vẫn nằm ở response_note).
UPDATE mentoring_requests SET reject_reason = 'OTHER' WHERE status = 'REJECTED' AND reject_reason IS NULL;

ALTER TABLE mentoring_requests ALTER COLUMN goal SET NOT NULL;
ALTER TABLE mentoring_requests ALTER COLUMN session_type SET NOT NULL;
ALTER TABLE mentoring_requests ALTER COLUMN frequency SET NOT NULL;
ALTER TABLE mentoring_requests ALTER COLUMN expected_duration_months SET NOT NULL;

-- Đếm nhanh yêu cầu PENDING của mentee (tối đa 3 — app.requests.max-pending).
CREATE INDEX IF NOT EXISTS idx_requests_mentee_pending ON mentoring_requests (mentee_id) WHERE status = 'PENDING';
