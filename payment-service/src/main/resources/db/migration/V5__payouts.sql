-- US-42 (PRD-PAY-4..6) — rút tiền (sandbox) cho mentor.
-- mentor_bank_accounts: 1 tài khoản nhận tiền / mentor; số tài khoản lưu đủ (admin cần để chuyển khoản) nhưng API chỉ trả
-- bản che (••••1234).
CREATE TABLE IF NOT EXISTS mentor_bank_accounts (
    mentor_id      UUID PRIMARY KEY,
    bank_name      TEXT NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 100),
    account_number TEXT NOT NULL CHECK (account_number ~ '^[0-9]{6,20}$'),
    holder_name    TEXT NOT NULL CHECK (char_length(holder_name) BETWEEN 2 AND 100),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payouts: REQUESTED → PAID (admin nhập mã tham chiếu chuyển khoản) | REJECTED (kèm lý do). Số tiền chốt lúc yêu cầu =
-- toàn bộ số dư khả dụng; thông tin ngân hàng được chụp lại lúc yêu cầu. Tối đa 1 yêu cầu đang mở / mentor.
CREATE TABLE IF NOT EXISTS payouts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id      UUID NOT NULL,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status         TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PAID', 'REJECTED')),
    bank_name      TEXT NOT NULL,
    account_number TEXT NOT NULL,
    holder_name    TEXT NOT NULL,
    reference      TEXT,
    note           TEXT,
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at     TIMESTAMPTZ,
    decided_by     UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payouts_open ON payouts (mentor_id) WHERE status = 'REQUESTED';
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts (status, requested_at);

-- Khi admin đánh dấu PAID: ghi các dòng PAYOUT vào sổ (append-only) phân bổ theo từng giao dịch còn khả dụng.
ALTER TABLE mentor_ledger ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES payouts (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mentor_ledger_payout ON mentor_ledger (payout_id, transaction_id) WHERE type = 'PAYOUT';
