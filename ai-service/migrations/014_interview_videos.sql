-- 014 — Vòng 1 có camera: video + âm thanh của buổi phỏng vấn giọng nói (docs/design-mentor-verification.md §5, §9).
-- Mỗi buổi tối đa một dòng. File nằm trên đĩa (VERIFICATION_STORAGE_DIR/<storage_dir>), dòng này giữ metadata, cờ và hai bản
-- chép lời (trình duyệt gửi + server chép lại từ âm thanh) để admin đối chiếu. Hết hạn 60 ngày hoặc admin xoá: file bị xoá,
-- dòng vẫn còn (deleted_at) để giữ căn cứ.
CREATE TABLE IF NOT EXISTS interview_videos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id          UUID NOT NULL UNIQUE REFERENCES interviews (id) ON DELETE CASCADE,
    mentor_id             UUID NOT NULL,
    consent_video         BOOLEAN NOT NULL DEFAULT false,
    storage_dir           TEXT NOT NULL,
    video_mime            TEXT,
    audio_mime            TEXT,
    chunks                JSONB NOT NULL DEFAULT '[]'::jsonb,
    audio_chunks          JSONB NOT NULL DEFAULT '[]'::jsonb,
    size_bytes            BIGINT NOT NULL DEFAULT 0,
    duration_s            REAL,
    gap_detected          BOOLEAN NOT NULL DEFAULT false,
    gap_total_seconds     REAL NOT NULL DEFAULT 0,
    flags                 TEXT[] NOT NULL DEFAULT '{}',
    server_transcript     TEXT,
    transcript_diff       REAL,
    transcript_check      TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (transcript_check IN ('PENDING', 'OK', 'MISMATCH', 'UNAVAILABLE')),
    finished_at           TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    processed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ NOT NULL,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID
);
CREATE INDEX IF NOT EXISTS idx_interview_videos_expiry ON interview_videos (expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interview_videos_unfinished ON interview_videos (created_at) WHERE finished_at IS NULL;
