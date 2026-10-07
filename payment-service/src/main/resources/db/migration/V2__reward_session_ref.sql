-- US-01 — điểm thưởng xin lỗi khi mentor huỷ phiên (reason = MENTOR_CANCEL_APOLOGY).
-- session_id + unique index làm cho POST /internal/rewards idempotent (mentoring-service gửi lại qua outbox).
ALTER TABLE reward_ledger ADD COLUMN IF NOT EXISTS session_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_ledger_session_reason
    ON reward_ledger (user_id, reason, session_id) WHERE session_id IS NOT NULL;
