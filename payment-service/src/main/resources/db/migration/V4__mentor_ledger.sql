-- US-25 (PRD-PAY-3, PRD-SES-9) — sổ thu nhập mentor (append-only) + lịch giải phóng thu nhập.
--
-- mentor_ledger: mỗi biến động tiền của mentor là 1 dòng, KHÔNG bao giờ UPDATE/DELETE (trigger chặn ở dưới):
--   EARNING_PENDING   = mentor_earning của giao dịch, ghi khi charge SUCCESS (phiên CONFIRMED)
--   EARNING_AVAILABLE = phần đang chờ được giải phóng (48 giờ sau trạng thái cuối COMPLETED / NO_SHOW_MENTEE, không tranh chấp)
--   REVERSAL          = thu hồi theo tỉ lệ khi hoàn tiền: earning × (refund / amount) (làm tròn luỹ kế, tổng = earning)
--   PAYOUT            = đã chi trả cho mentor (chưa có luồng chi trả — để sẵn kiểu)
-- Số dư mỗi giao dịch (EarningRules.balance): pending = max(P − R − A, 0); available = A − O − max(R + A − P, 0); paidOut = O.
CREATE TABLE IF NOT EXISTS mentor_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id       UUID NOT NULL,
    session_id      UUID NOT NULL,
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    type            TEXT NOT NULL CHECK (type IN ('EARNING_PENDING', 'EARNING_AVAILABLE', 'REVERSAL', 'PAYOUT')),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    refund_id       UUID REFERENCES refunds(id),          -- REVERSAL: lần hoàn tiền gây ra dòng này
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentor_ledger_mentor ON mentor_ledger (mentor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mentor_ledger_transaction ON mentor_ledger (transaction_id);
-- 1 dòng PENDING / giao dịch, 1 dòng REVERSAL / lần hoàn → ghi lại 2 lần không nhân đôi số dư.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mentor_ledger_pending ON mentor_ledger (transaction_id) WHERE type = 'EARNING_PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS uq_mentor_ledger_reversal ON mentor_ledger (refund_id) WHERE type = 'REVERSAL';

CREATE OR REPLACE FUNCTION mentor_ledger_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'mentor_ledger is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_mentor_ledger_append_only ON mentor_ledger;
CREATE TRIGGER trg_mentor_ledger_append_only BEFORE UPDATE OR DELETE ON mentor_ledger
    FOR EACH ROW EXECUTE FUNCTION mentor_ledger_append_only();

-- Đồng hồ 48 giờ thuộc payment-service: mentoring-service báo trạng thái cuối của phiên
-- (POST /internal/payments/sessions/{sessionId}/final-state); release_at = ended_at + app.earnings.release-delay (hoặc
-- ngay lập tức khi tranh chấp được giải quyết). Job giải phóng các dòng release_at ≤ now, settled_at IS NULL và giao dịch
-- không ON_HOLD (tranh chấp đang mở). Bảng này là trạng thái lịch, không phải sổ cái nên được cập nhật.
CREATE TABLE IF NOT EXISTS earning_schedules (
    transaction_id  UUID PRIMARY KEY REFERENCES transactions(id),
    session_id      UUID NOT NULL,
    mentor_id       UUID NOT NULL,
    final_state     TEXT NOT NULL,
    ended_at        TIMESTAMPTZ NOT NULL,
    release_at      TIMESTAMPTZ NOT NULL,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_earning_schedules_due ON earning_schedules (release_at) WHERE settled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_earning_schedules_session ON earning_schedules (session_id);

-- Backfill (phần payment): mọi giao dịch đã thu tiền trước US-25 → 1 dòng EARNING_PENDING + REVERSAL theo các lần hoàn.
-- Dòng EARNING_AVAILABLE của phiên đã COMPLETED/NO_SHOW_MENTEE > 48 giờ KHÔNG ghi ở đây (payment không biết trạng thái
-- phiên): migration V10 của mentoring-service xếp hàng "final-state" cho các phiên đó vào outbox, payment lập lịch với
-- release_at = ended_at + 48h (đã quá hạn) và job giải phóng ghi EARNING_AVAILABLE ở lần chạy đầu tiên.
INSERT INTO mentor_ledger (mentor_id, session_id, transaction_id, type, amount, created_at)
SELECT t.mentor_id, t.session_id, t.id, 'EARNING_PENDING', t.mentor_earning, t.created_at
  FROM transactions t
 WHERE t.status IN ('SUCCESS', 'ON_HOLD', 'PARTIALLY_REFUNDED', 'REFUNDED')
   AND t.mentor_earning > 0
   AND NOT EXISTS (SELECT 1 FROM mentor_ledger l WHERE l.transaction_id = t.id AND l.type = 'EARNING_PENDING');

INSERT INTO mentor_ledger (mentor_id, session_id, transaction_id, type, amount, refund_id, created_at)
SELECT x.mentor_id, x.session_id, x.transaction_id, 'REVERSAL', x.reversal, x.refund_id, x.created_at
  FROM (SELECT t.mentor_id, t.session_id, t.id AS transaction_id, r.id AS refund_id, r.created_at,
               ROUND(t.mentor_earning * (SUM(r.amount) OVER w) / t.amount, 0)
             - ROUND(t.mentor_earning * ((SUM(r.amount) OVER w) - r.amount) / t.amount, 0) AS reversal
          FROM refunds r
          JOIN transactions t ON t.id = r.transaction_id
         WHERE t.mentor_earning > 0 AND t.amount > 0
        WINDOW w AS (PARTITION BY r.transaction_id ORDER BY r.created_at, r.id
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) x
 WHERE x.reversal > 0
   AND NOT EXISTS (SELECT 1 FROM mentor_ledger l WHERE l.refund_id = x.refund_id AND l.type = 'REVERSAL');
