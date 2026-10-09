-- US-37 (PRD-PROF-1, PRD-PROF-3, PRD-PROF-6)
--   mentor_profiles.headline   câu giới thiệu ngắn ≤ 80 ký tự, hiện trên thẻ mentor
--   mentee_profiles.timezone   múi giờ IANA của mentee (mentor đã có từ V4); mọi giờ lưu UTC, hiển thị theo múi giờ người xem
--   profile_avatars            ảnh đại diện JPG/PNG ≤ 2 MB (lưu trong CSDL — không có kho file dùng chung); 1 ảnh / người
-- Grant SELECT của matching_reader ở mức bảng nên matching-service đọc được cột mới của mentor/mentee_profiles.
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS headline TEXT CHECK (headline IS NULL OR char_length(headline) <= 80);

ALTER TABLE mentee_profiles
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

CREATE TABLE IF NOT EXISTS profile_avatars (
    user_id      UUID PRIMARY KEY,
    content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    data         BYTEA NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 2097152),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
