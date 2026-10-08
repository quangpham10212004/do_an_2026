-- US-32 (PRD-ADM-1) — tranh chấp phiên mentoring.
-- Mở: mentee/mentor của phiên ("Báo cáo sự cố") trong 7 ngày sau giờ kết thúc với phiên COMPLETED / NO_SHOW_* /
-- AWAITING_ATTENDANCE, hoặc hệ thống tự mở (type NO_SHOW, opened_by NULL) khi phiên chuyển DISPUTED (US-12).
-- Mở → giao dịch ON_HOLD (chặn giải phóng thu nhập, US-25). Admin: OPEN → IN_REVIEW (first_response_at, SLA 48 giờ)
-- → RESOLVED với outcome FULL_REFUND | PARTIAL_REFUND (1–99%) | NO_REFUND | WARNING | SUSPEND.
CREATE TABLE IF NOT EXISTS disputes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         UUID NOT NULL REFERENCES sessions(id),
    opened_by          UUID,                               -- NULL = hệ thống (phiên DISPUTED)
    opened_by_role     TEXT NOT NULL CHECK (opened_by_role IN ('MENTEE', 'MENTOR', 'SYSTEM')),
    type               TEXT NOT NULL CHECK (type IN ('NO_SHOW', 'QUALITY', 'BEHAVIOR', 'PAYMENT', 'OTHER')),
    description        TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
    evidence_links     TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_links) <= 5),
    status             TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED')),
    outcome            TEXT CHECK (outcome IN ('FULL_REFUND', 'PARTIAL_REFUND', 'NO_REFUND', 'WARNING', 'SUSPEND')),
    refund_percent     INTEGER CHECK (refund_percent BETWEEN 0 AND 100),
    resolution_note    TEXT,
    resolved_by        UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_response_at  TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    CHECK ((status = 'RESOLVED') = (outcome IS NOT NULL))
);
-- Mỗi phiên tối đa 1 tranh chấp đang mở (OPEN / IN_REVIEW).
CREATE UNIQUE INDEX IF NOT EXISTS uq_disputes_session_open ON disputes (session_id) WHERE status <> 'RESOLVED';
CREATE INDEX IF NOT EXISTS idx_disputes_status_created ON disputes (status, created_at);
CREATE INDEX IF NOT EXISTS idx_disputes_session ON disputes (session_id);

-- Outbox: RELEASE (giải phóng giao dịch tạm giữ trước khi hoàn / trả mentor khi kết luận tranh chấp).
ALTER TABLE payment_outbox DROP CONSTRAINT IF EXISTS payment_outbox_kind_check;
ALTER TABLE payment_outbox ADD CONSTRAINT payment_outbox_kind_check
    CHECK (kind IN ('REWARD', 'REFUND', 'HOLD', 'FINAL_STATE', 'RELEASE'));

-- Phiên đã DISPUTED từ Sprint 2 (chờ US-32): tạo tranh chấp NO_SHOW đang mở để admin xử lý.
INSERT INTO disputes (session_id, opened_by, opened_by_role, type, description, created_at)
SELECT s.id, NULL, 'SYSTEM', 'NO_SHOW',
       'Hai bên xác nhận tham dự khác nhau: mentee ' || COALESCE(s.mentee_attendance, '—') || ', mentor '
           || COALESCE(s.mentor_attendance, '—') || '.',
       COALESCE(s.resolved_at, s.updated_at)
  FROM sessions s
 WHERE s.status = 'DISPUTED'
   AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.session_id = s.id);
