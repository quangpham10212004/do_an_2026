-- Phỏng vấn AI trực tiếp xác thực mentor (thay luồng trắc nghiệm + chat + video của 018).
-- Lượt xác thực theo lĩnh vực vẫn nằm ở mentor_assessment_tracks (details.stage đổi sang
-- READY | IN_PROGRESS | PENDING_REVIEW | PASSED | FAILED | EXPIRED); các bảng 018 khác không còn được ghi.

CREATE TABLE mentor_live_interviews (
    id UUID PRIMARY KEY,
    track_id UUID NOT NULL REFERENCES mentor_assessment_tracks(id),
    mentor_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED')),
    -- kế hoạch câu hỏi, lượt hội thoại, đồng hồ còn lại, chỉ số câu hiện tại
    details JSONB NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resume_deadline TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mentor_live_interviews_track ON mentor_live_interviews (track_id, created_at DESC);
CREATE UNIQUE INDEX mentor_live_interviews_open ON mentor_live_interviews (track_id) WHERE status = 'IN_PROGRESS';

CREATE TABLE mentor_live_answers (
    id UUID PRIMARY KEY,
    interview_id UUID NOT NULL REFERENCES mentor_live_interviews(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    topic TEXT NOT NULL,
    question TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    -- đánh giá của engine: rubric, score, feedback, flags, engine, model
    evaluation JSONB NOT NULL,
    media_mime TEXT,
    media_bytes BIGINT,
    keep_until TIMESTAMPTZ,
    media_deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (interview_id, position)
);

CREATE TABLE mentor_live_results (
    id UUID PRIMARY KEY,
    interview_id UUID NOT NULL UNIQUE REFERENCES mentor_live_interviews(id),
    track_id UUID NOT NULL REFERENCES mentor_assessment_tracks(id),
    mentor_id UUID NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('PASSED', 'FAILED', 'UNCLEAR')),
    total_score NUMERIC(3, 1) NOT NULL,
    -- tiêu chí, nhận xét, khuyến nghị AI, độ tin cậy, điểm cần cải thiện
    details JSONB NOT NULL,
    decided_by TEXT CHECK (decided_by IN ('AI', 'ADMIN')),
    decided_at TIMESTAMPTZ,
    admin_note TEXT,
    retry_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mentor_live_results_mentor ON mentor_live_results (mentor_id, submitted_at DESC);
CREATE INDEX mentor_live_results_review ON mentor_live_results (decided_by, submitted_at);
