-- US-16 (PRD-PROF-2) — sở thích tìm mentor của mentee. matching-service đọc các cột này (role
-- matching_reader, grant SELECT ở mức bảng mentee_profiles nên tự có quyền) và dùng làm giá trị
-- mặc định cho bộ lọc GET /api/matching/mentors khi request không truyền (US-17).
--   preferred_days          ngày trong tuần muốn học, ISO-8601: 1 = Thứ Hai ... 7 = Chủ Nhật; rỗng = ngày nào cũng được
--   preferred_time_of_day   MORNING (06–12) | AFTERNOON (12–18) | EVENING (18–23) | NULL = giờ nào cũng được
--   budget_max_per_hour     ngân sách tối đa VND / giờ; NULL = không giới hạn
--   languages               ngôn ngữ mong muốn: vi, en; rỗng = ngôn ngữ nào cũng được
ALTER TABLE mentee_profiles
    ADD COLUMN IF NOT EXISTS preferred_days INTEGER[] NOT NULL DEFAULT '{}'
        CHECK (preferred_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
    ADD COLUMN IF NOT EXISTS preferred_time_of_day TEXT
        CHECK (preferred_time_of_day IN ('MORNING', 'AFTERNOON', 'EVENING')),
    ADD COLUMN IF NOT EXISTS budget_max_per_hour NUMERIC(12,2)
        CHECK (budget_max_per_hour >= 0),
    ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}'
        CHECK (languages <@ ARRAY['vi', 'en']::TEXT[]);
