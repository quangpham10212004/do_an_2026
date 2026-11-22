-- Blog của mentor / mentee (learning_db). Đăng ngay, admin gỡ khi vi phạm.

CREATE TABLE IF NOT EXISTS blog_posts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id        UUID NOT NULL,
    -- Snapshot lúc tạo/sửa để liệt kê bài không phải gọi profile-service
    author_name      TEXT NOT NULL,
    author_role      TEXT NOT NULL CHECK (author_role IN ('MENTOR', 'MENTEE', 'ADMIN')),
    title            TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,
    summary          TEXT NOT NULL DEFAULT '',
    content_md       TEXT NOT NULL DEFAULT '',
    cover_url        TEXT,
    status           TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')),
    unpublish_reason TEXT,
    reading_minutes  INTEGER NOT NULL DEFAULT 1,
    like_count       INTEGER NOT NULL DEFAULT 0,
    comment_count    INTEGER NOT NULL DEFAULT 0,
    published_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_vec       TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content_md, ''))
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (published_at DESC) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_search ON blog_posts USING GIN (search_vec);

CREATE TABLE IF NOT EXISTS blog_tags (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name  TEXT NOT NULL,
    slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag ON blog_post_tags (tag_id);

-- Bình luận 1 cấp trả lời; gỡ bằng status (giữ chỗ để câu trả lời không mồ côi)
CREATE TABLE IF NOT EXISTS blog_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES blog_comments(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL,
    author_name TEXT NOT NULL,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'VISIBLE' CHECK (status IN ('VISIBLE', 'REMOVED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments (post_id, created_at);

CREATE TABLE IF NOT EXISTS blog_likes (
    post_id    UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS blog_bookmarks (
    post_id    UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_bookmarks_user ON blog_bookmarks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_follows (
    follower_id UUID NOT NULL,
    author_id   UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, author_id),
    CHECK (follower_id <> author_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_follows_author ON blog_follows (author_id);

-- target_id trỏ tới bài hoặc bình luận (đa hình nên không có FK); post_id để admin mở bài nhanh
CREATE TABLE IF NOT EXISTS blog_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('POST', 'COMMENT')),
    target_id   UUID NOT NULL,
    post_id     UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mỗi người một báo cáo mở cho một đối tượng
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_reports_open
    ON blog_reports (reporter_id, target_type, target_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_blog_reports_status ON blog_reports (status, created_at);

INSERT INTO blog_tags (name, slug) VALUES
 ('Java', 'java'), ('Spring Boot', 'spring-boot'), ('React', 'react'), ('Next.js', 'next-js'),
 ('TypeScript', 'typescript'), ('Python', 'python'), ('DevOps', 'devops'), ('Docker', 'docker'),
 ('System Design', 'system-design'), ('Database', 'database'), ('Machine Learning', 'machine-learning'),
 ('Career', 'career'), ('Interview', 'interview')
ON CONFLICT DO NOTHING;
