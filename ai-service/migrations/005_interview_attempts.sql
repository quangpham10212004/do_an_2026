-- US-22 (PRD-AIV-1, PRD-AIV-4): màn hình giới thiệu + quy tắc số lần phỏng vấn.
--
-- self_answer_acknowledged: mentor đã tick "Tôi tự trả lời, không có sự trợ giúp từ bên ngoài" khi bắt đầu.
-- Buổi phỏng vấn cũ (trước Sprint 3) chưa từng được hỏi => false.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS self_answer_acknowledged BOOLEAN NOT NULL DEFAULT false;

-- Admin mở khoá cho mentor đã bị từ chối đủ số lần tối đa. Số lần đã dùng và thời gian chờ chỉ tính các buổi
-- tạo SAU lần mở khoá gần nhất. Bảng chỉ thêm dòng (lịch sử mở khoá); hành động cũng được ghi vào audit log.
CREATE TABLE IF NOT EXISTS interview_attempt_unlocks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id   UUID NOT NULL,
    unlocked_by UUID,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_interview_attempt_unlocks_mentor ON interview_attempt_unlocks (mentor_id, created_at DESC);
