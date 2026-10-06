-- profile-service database init (profile_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)
--
-- profile-service chỉ sở hữu dữ liệu hồ sơ. Embedding (vector + hash + trạng thái
-- index) thuộc về matching-service và nằm trong matching_db — xem
-- db/init/matching-service.sql và CONVENTIONS.md mục 1 & 7.

CREATE TABLE IF NOT EXISTS mentor_profiles (
    user_id               UUID PRIMARY KEY,
    display_name          TEXT NOT NULL,
    skills                TEXT[] NOT NULL DEFAULT '{}',
    domain                TEXT NOT NULL,
    bio                   TEXT,
    years_experience      INTEGER NOT NULL DEFAULT 0,
    cv_file_url           TEXT,
    portfolio_links       TEXT[] NOT NULL DEFAULT '{}',
    hourly_rate           NUMERIC(12,2) NOT NULL DEFAULT 0,       -- VND / giờ, 0 = miễn phí
    capacity              INTEGER NOT NULL DEFAULT 3,             -- số mentee tối đa cùng lúc
    active_mentee_count   INTEGER NOT NULL DEFAULT 0,             -- do mentoring-service đồng bộ
    is_available          BOOLEAN NOT NULL DEFAULT true,
    rating                REAL NOT NULL DEFAULT 0,                -- do mentoring-service đồng bộ
    rating_count          INTEGER NOT NULL DEFAULT 0,
    verification_status   TEXT NOT NULL DEFAULT 'PENDING_INTERVIEW'
        CHECK (verification_status IN ('PENDING_INTERVIEW', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentee_profiles (
    user_id               UUID PRIMARY KEY,
    display_name          TEXT NOT NULL,
    goal                  TEXT,
    domain                TEXT NOT NULL,
    current_level         TEXT NOT NULL DEFAULT 'BEGINNER'
        CHECK (current_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    skills                TEXT[] NOT NULL DEFAULT '{}',
    portfolio_links       TEXT[] NOT NULL DEFAULT '{}',
    cv_file_url           TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lịch rảnh định kỳ hằng tuần của mentor (giờ địa phương Asia/Ho_Chi_Minh).
-- day_of_week theo ISO-8601: 1 = Thứ Hai ... 7 = Chủ Nhật.
CREATE TABLE IF NOT EXISTS mentor_availability (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id    UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
    day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_mentor_availability_mentor ON mentor_availability (mentor_id);

-- Role read-only cho matching-service (ngoại lệ kiến trúc đã duyệt,
-- CONVENTIONS.md mục 7): chỉ được SELECT, không thể ghi vào profile.
-- matching-service đọc các bảng này để lấy text nguồn cho embedding và để lọc/
-- xếp hạng mentor; vector kết quả được ghi vào matching_db của chính nó.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matching_reader') THEN
        CREATE ROLE matching_reader LOGIN PASSWORD 'matching_reader';
    END IF;
END
$$;
GRANT CONNECT ON DATABASE profile_db TO matching_reader;
GRANT USAGE ON SCHEMA public TO matching_reader;
GRANT SELECT ON mentor_profiles, mentee_profiles, mentor_availability TO matching_reader;
