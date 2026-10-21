-- Bản chốt v2.0 §3-4 — cấp độ mentor (JUNIOR/SENIOR/EXPERT) do admin gán khi duyệt phỏng vấn.
-- NULL = chưa được duyệt theo cấp. Mentor đã APPROVED từ trước được gán cấp suy ra từ mức giá hiện có
-- (không đổi giá của họ; khung giá chỉ kiểm tra khi mentor đổi giá hoặc đổi cấp).
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IS NULL OR tier IN ('JUNIOR', 'SENIOR', 'EXPERT')),
    ADD COLUMN IF NOT EXISTS tier_assigned_at TIMESTAMPTZ;

UPDATE mentor_profiles
SET tier = CASE WHEN hourly_rate <= 200000 THEN 'JUNIOR' WHEN hourly_rate <= 400000 THEN 'SENIOR' ELSE 'EXPERT' END,
    tier_assigned_at = now()
WHERE verification_status = 'APPROVED' AND tier IS NULL;
