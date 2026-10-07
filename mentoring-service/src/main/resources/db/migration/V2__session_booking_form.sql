-- US-03 (PRD-SES-2) — form đặt lịch: loại phiên, agenda bắt buộc, link tài liệu đọc trước (tuỳ chọn).
-- Phiên cũ không có session_type/agenda nên các cột cho phép NULL; ràng buộc bắt buộc nằm ở API.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type TEXT
    CHECK (session_type IN ('CAREER_ADVICE', 'CODE_REVIEW', 'MOCK_INTERVIEW', 'PROJECT_GUIDANCE'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agenda TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pre_read_link TEXT;
