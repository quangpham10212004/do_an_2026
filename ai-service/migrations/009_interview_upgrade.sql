-- 009 — Bản chốt v2.0 §3: mentor đã duyệt xin nâng cấp sau 90 ngày. kind = UPGRADE: không tính vào giới hạn số lần
-- / thời gian chờ 7 ngày, từ chối thì giữ nguyên APPROVED + cấp cũ. from_tier = cấp lúc bắt đầu buổi xin nâng cấp.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'VERIFICATION'
    CHECK (kind IN ('VERIFICATION', 'UPGRADE'));
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS from_tier TEXT
    CHECK (from_tier IS NULL OR from_tier IN ('JUNIOR', 'SENIOR', 'EXPERT'));
