-- Chuyển ngách: lĩnh vực mentor từng làm trước lĩnh vực hiện tại (vd. backend → data).
-- matching-service dùng để ưu tiên mentor "đã đi đúng con đường" của mentee muốn chuyển ngách.
ALTER TABLE mentor_profiles
    ADD COLUMN IF NOT EXISTS previous_domains TEXT[] NOT NULL DEFAULT '{}';
