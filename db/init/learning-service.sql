CREATE TABLE IF NOT EXISTS courses (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title   TEXT NOT NULL,
    domain  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_progress (
    course_id        UUID REFERENCES courses(id),
    user_id          UUID NOT NULL,
    percent_complete REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (course_id, user_id)
);
