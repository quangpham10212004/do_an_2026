-- Bản chốt v2.0 §11 — giới thiệu người học theo từng mentor, thưởng bằng tiền khuyến mãi.
--
-- mentor_referral_codes: mỗi cặp (người giới thiệu, mentor) một mã — chỉ cấp khi người giới thiệu đã hoàn thành >= 1 buổi thường đã
--                        trả tiền với mentor đó (kiểm tra ở service từ transactions + earning_schedules).
-- mentor_referrals     : người được giới thiệu dùng mã ở yêu cầu đặt buổi thường đầu tiên với mentor (session_id).
--                        REGISTERED -> (buổi COMPLETED, đã trả, qua 7 ngày không hoàn tiền) -> QUALIFIED (+30.000đ khuyến mãi)
--                        UNDER_REVIEW = bất thường (> 3 lượt dùng mã trong 24 giờ) chờ admin; CAPPED = vượt trần 5 lượt thưởng / tháng;
--                        REJECTED = buổi bị hoàn tiền / không hoàn thành / admin từ chối.
-- transactions.session_kind: REGULAR | TRIAL — buổi trải nghiệm không tính để được cấp mã.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'REGULAR' CHECK (session_kind IN ('REGULAR', 'TRIAL'));

CREATE TABLE IF NOT EXISTS mentor_referral_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL,
    mentor_id   UUID NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, mentor_id)
);

CREATE TABLE IF NOT EXISTS mentor_referrals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_id       UUID NOT NULL REFERENCES mentor_referral_codes(id),
    owner_id      UUID NOT NULL,
    mentor_id     UUID NOT NULL,
    referee_id    UUID NOT NULL,
    session_id    UUID NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'UNDER_REVIEW', 'QUALIFIED', 'REJECTED', 'CAPPED')),
    reject_reason TEXT,
    reward_amount NUMERIC(12,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at    TIMESTAMPTZ,
    CHECK (owner_id <> referee_id),
    UNIQUE (referee_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS idx_mentor_referrals_owner ON mentor_referrals (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_referrals_pending ON mentor_referrals (status) WHERE status = 'REGISTERED';
