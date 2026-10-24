-- D6 (docs/design-mentor-verification.md) — bỏ cấp độ mentor khỏi toàn bộ dự án: giá do mentor tự đặt,
-- không còn khung giá theo cấp và không còn luồng xin nâng cấp (V9__mentor_tier.sql).
-- KHÔNG đảo ngược được — đã sao lưu profile_db trước khi chạy (xem docs/report-task-verification.md).
ALTER TABLE mentor_profiles
    DROP COLUMN IF EXISTS tier,
    DROP COLUMN IF EXISTS tier_assigned_at;
