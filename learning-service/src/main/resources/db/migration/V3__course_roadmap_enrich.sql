-- Hoàn thiện Learning Hub: ảnh bìa, thời lượng, mục tiêu học, giai đoạn roadmap.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_url  TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS outcomes   TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 10;

ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS cover_url       TEXT;
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS level           TEXT NOT NULL DEFAULT 'BEGINNER'
    CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'));
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS estimated_weeks INTEGER;

ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS stage           TEXT;
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS estimated_hours INTEGER;
