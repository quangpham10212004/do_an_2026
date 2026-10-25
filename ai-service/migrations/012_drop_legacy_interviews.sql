-- 012 — Bỏ phỏng vấn chat và dữ liệu phỏng vấn cũ (D1/D12, docs/design-mentor-verification.md).
-- Chỉ còn phỏng vấn giọng nói; tier đã bỏ ở PR 1a nên kind / from_tier không còn nghĩa.
-- KHÔNG đảo ngược được — đã sao lưu ai_db trước khi chạy (xem docs/report-task-verification.md).
-- mentor_profiles.verification_status nằm ở profile_db nên không bị đụng.
DELETE FROM interview_turns;
DELETE FROM interviews;
ALTER TABLE interviews DROP COLUMN IF EXISTS kind;
ALTER TABLE interviews DROP COLUMN IF EXISTS from_tier;
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_mode_check;
ALTER TABLE interviews ALTER COLUMN mode SET DEFAULT 'VOICE';
ALTER TABLE interviews ADD CONSTRAINT interviews_mode_check CHECK (mode = 'VOICE');
