-- 013 — Đợt xác thực mentor (docs/design-mentor-verification.md §3, §9).
-- Một đợt (application) gom hai vòng; mỗi mentor tối đa một đợt chưa kết thúc. interviews = các lần làm vòng 1.
-- Trạng thái cấp buổi đổi theo quyết định ở cấp đợt: PASSED (admin cho qua vòng 1), REJECTED, RETAKE_REQUESTED,
-- INVALIDATED (không hoàn thành hợp lệ); APPROVED không còn ở cấp buổi (duyệt cuối thuộc đợt).
-- interview_attempt_unlocks bỏ: thay bằng quy tắc chờ 15 ngày, không còn nút mở khoá.
CREATE TABLE IF NOT EXISTS verification_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id           UUID NOT NULL,
    status              TEXT NOT NULL DEFAULT 'ROUND1' CHECK (status IN (
        'ROUND1', 'ROUND1_REVIEW', 'ROUND2_PENDING_SLOTS', 'ROUND2_PENDING_CHOICE', 'ROUND2_SCHEDULED',
        'APPROVED', 'REJECTED', 'CLOSED')),
    retake_count        INT NOT NULL DEFAULT 0,
    reschedule_count    INT NOT NULL DEFAULT 0,
    no_show_count       INT NOT NULL DEFAULT 0,
    round1_decision     TEXT CHECK (round1_decision IN ('PASS', 'REJECT', 'RETAKE')),
    round1_reviewed_by  UUID,
    round1_reviewed_at  TIMESTAMPTZ,
    round1_note         TEXT,
    reviewed_by         UUID,
    review_note         TEXT,
    reviewed_at         TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    retry_after         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_open_per_mentor ON verification_applications (mentor_id)
    WHERE status NOT IN ('APPROVED', 'REJECTED', 'CLOSED');
CREATE INDEX IF NOT EXISTS idx_verification_mentor ON verification_applications (mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_applications (status);

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES verification_applications (id);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews (application_id);

ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
UPDATE interviews SET status = 'PASSED' WHERE status = 'APPROVED';
ALTER TABLE interviews ADD CONSTRAINT interviews_status_check CHECK (status IN (
    'IN_PROGRESS', 'PENDING_REVIEW', 'PASSED', 'REJECTED', 'RETAKE_REQUESTED', 'ABANDONED', 'INVALIDATED'));

DROP TABLE IF EXISTS interview_attempt_unlocks;
