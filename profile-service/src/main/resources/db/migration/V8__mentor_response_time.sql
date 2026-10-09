-- US-35 (PRD-MATCH-3, PRD-MATCH-9) — thời gian phản hồi yêu cầu (trung vị, giờ) do mentoring-service đồng bộ qua
-- PUT /internal/mentor/{id}/response-time (giống rating). NULL = chưa có yêu cầu nào để tính.
-- matching-service đọc cột này để tính responsiveness, và đọc ngoại lệ lịch rảnh để tính scheduleFit (độ khớp lịch
-- rảnh 14 ngày tới) — cấp thêm SELECT bảng ngoại lệ cho matching_reader (CONVENTIONS mục 7).
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS median_response_hours NUMERIC(8,2) CHECK (median_response_hours IS NULL OR median_response_hours >= 0),
    ADD COLUMN IF NOT EXISTS response_sample_size INTEGER NOT NULL DEFAULT 0 CHECK (response_sample_size >= 0);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matching_reader') THEN
        GRANT SELECT ON mentor_availability_exceptions TO matching_reader;
    END IF;
END
$$;
