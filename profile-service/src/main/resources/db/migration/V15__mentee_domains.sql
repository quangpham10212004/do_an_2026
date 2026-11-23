-- Mentee học nhiều lĩnh vực: lĩnh vực CHÍNH vẫn nằm ở mentee_profiles (domain, skills, goal);
-- bảng này chỉ giữ các lĩnh vực PHỤ, mỗi lĩnh vực có kỹ năng và mục tiêu riêng (tối đa 2 phụ = 3 lĩnh vực).
CREATE TABLE mentee_domains (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id UUID NOT NULL REFERENCES mentee_profiles(user_id) ON DELETE CASCADE,
    domain    VARCHAR(50) NOT NULL,
    skills    TEXT[] NOT NULL DEFAULT '{}',
    goal      TEXT,
    added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (mentee_id, domain)
);
CREATE INDEX mentee_domains_by_mentee ON mentee_domains (mentee_id, added_at);

-- matching-service (role matching_reader, chỉ đọc) dùng bảng này để dựng vector truy vấn theo lĩnh vực được chọn.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matching_reader') THEN
        GRANT SELECT ON mentee_domains TO matching_reader;
    END IF;
END $$;
