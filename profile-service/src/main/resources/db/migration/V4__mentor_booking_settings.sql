-- US-04 (PRD-SES-3, một phần PRD-PROF-3) — cài đặt đặt lịch của mentor, mentoring-service đọc qua
-- GET /internal/mentor/{id}:
--   meeting_link      link họp https trên meet.google.com, zoom.us, *.zoom.us, teams.microsoft.com
--   buffer_minutes    khoảng nghỉ giữa 2 phiên: 0 | 15 | 30
--   min_notice_hours  phải đặt trước ít nhất N giờ: 1–72
--   languages         ngôn ngữ hướng dẫn: vi, en
--   session_types     loại phiên nhận: CAREER_ADVICE, CODE_REVIEW, MOCK_INTERVIEW, PROJECT_GUIDANCE
--   timezone          múi giờ IANA của mentor (lịch rảnh/ngoại lệ/nghỉ phép tính theo múi giờ này)
-- Mentor hiện có nhận giá trị mặc định: tiếng Việt, mọi loại phiên (để bộ lọc matching sau này không
-- loại oan mentor chưa cập nhật). Grant SELECT của matching_reader ở mức bảng => đọc được cột mới.
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS meeting_link TEXT,
    ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 15
        CHECK (buffer_minutes IN (0, 15, 30)),
    ADD COLUMN IF NOT EXISTS min_notice_hours INTEGER NOT NULL DEFAULT 12
        CHECK (min_notice_hours BETWEEN 1 AND 72),
    ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{vi}'
        CHECK (languages <@ ARRAY['vi', 'en']::TEXT[]),
    ADD COLUMN IF NOT EXISTS session_types TEXT[] NOT NULL
        DEFAULT '{CAREER_ADVICE,CODE_REVIEW,MOCK_INTERVIEW,PROJECT_GUIDANCE}'
        CHECK (session_types <@ ARRAY['CAREER_ADVICE', 'CODE_REVIEW', 'MOCK_INTERVIEW', 'PROJECT_GUIDANCE']::TEXT[]),
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
