CREATE TABLE mentor_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
    domain VARCHAR(50) NOT NULL,
    state VARCHAR(8) NOT NULL CHECK (state IN ('PENDING', 'VERIFIED', 'REJECTED')),
    added_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    hourly_rate NUMERIC(12, 2),
    accepting BOOLEAN NOT NULL DEFAULT TRUE,
    stage VARCHAR(5) NOT NULL DEFAULT 'CV',
    test_score INTEGER CHECK (test_score BETWEEN 0 AND 100),
    rejected_reason TEXT,
    retry_at TIMESTAMPTZ,
    cv_id UUID,
    UNIQUE (mentor_id, domain),
    CHECK ((state = 'VERIFIED') = (verified_at IS NOT NULL))
);

INSERT INTO mentor_domains (mentor_id, domain, state, added_at, verified_at)
SELECT user_id, lower(domain), 'VERIFIED', created_at, updated_at
FROM mentor_profiles WHERE verification_status = 'APPROVED';

CREATE INDEX mentor_domains_verified_lookup ON mentor_domains (domain, mentor_id) WHERE verified_at IS NOT NULL;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matching_reader') THEN
        GRANT SELECT (mentor_id, domain, verified_at, hourly_rate, accepting) ON mentor_domains TO matching_reader;
    END IF;
END $$;

CREATE TABLE domain_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submitted_by UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
