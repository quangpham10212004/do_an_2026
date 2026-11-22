CREATE TABLE mentor_assessment_tracks (
    id UUID PRIMARY KEY,
    mentor_id UUID NOT NULL,
    domain TEXT NOT NULL,
    profile_domain_id UUID,
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    profile_synced BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX mentor_assessment_active_domain
    ON mentor_assessment_tracks (mentor_id, domain) WHERE cancelled_at IS NULL;

CREATE TABLE mentor_assessment_sessions (
    id UUID PRIMARY KEY,
    track_id UUID NOT NULL REFERENCES mentor_assessment_tracks(id),
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mentor_assessment_sessions_track ON mentor_assessment_sessions (track_id, created_at DESC);

CREATE TABLE mentor_assessment_videos (
    id UUID PRIMARY KEY,
    track_id UUID NOT NULL REFERENCES mentor_assessment_tracks(id),
    mime TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    keep_until TIMESTAMPTZ NOT NULL,
    processing_started_at TIMESTAMPTZ,
    analysis JSONB,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX mentor_assessment_videos_track ON mentor_assessment_videos (track_id, created_at DESC);
