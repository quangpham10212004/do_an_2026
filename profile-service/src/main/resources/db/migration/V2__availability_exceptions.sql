-- US-07 (PRD-PROF-4) — ngoại lệ lịch rảnh: mentor báo nghỉ cả ngày (start_time/end_time NULL)
-- hoặc bận một khoảng giờ trong một ngày cụ thể. Giờ theo múi giờ của mentor.
-- mentoring-service nhận các ngoại lệ 60 ngày tới qua GET /internal/mentor/{id} để không cho đặt
-- lịch vào khoảng bị chặn. matching-service KHÔNG đọc bảng này (không grant cho matching_reader).
CREATE TABLE IF NOT EXISTS mentor_availability_exceptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id   UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    start_time  TIME,
    end_time    TIME,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX IF NOT EXISTS idx_mentor_availability_exceptions_mentor_date
    ON mentor_availability_exceptions (mentor_id, date);
