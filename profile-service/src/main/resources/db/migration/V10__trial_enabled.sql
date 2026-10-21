-- Bản chốt v2.0 §10 — mentor bật / tắt nhận buổi trải nghiệm 15 phút (mặc định bật).
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS trial_enabled BOOLEAN NOT NULL DEFAULT true;
