-- profile-service database init
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS mentor_profiles (
    user_id           UUID PRIMARY KEY,
    display_name      TEXT NOT NULL,
    skills            TEXT[] NOT NULL DEFAULT '{}',
    domain            TEXT NOT NULL,
    bio               TEXT,
    years_experience  INTEGER DEFAULT 0,
    cv_file_url       TEXT,
    capacity          INTEGER NOT NULL DEFAULT 0,
    is_available      BOOLEAN NOT NULL DEFAULT true,
    rating            REAL NOT NULL DEFAULT 0,
    embedding         VECTOR(384),
    embedding_updated_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentee_profiles (
    user_id           UUID PRIMARY KEY,
    display_name      TEXT NOT NULL,
    goal              TEXT,
    domain            TEXT NOT NULL,
    current_level     TEXT DEFAULT 'BEGINNER',
    cv_file_url       TEXT,
    embedding         VECTOR(384),
    embedding_updated_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index để similarity search nhanh — dùng cosine distance (khớp với
-- toán tử <=> trong matching_pipeline.py)
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_embedding
    ON mentor_profiles USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_mentee_profiles_embedding
    ON mentee_profiles USING hnsw (embedding vector_cosine_ops);
