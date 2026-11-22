ALTER TABLE blog_posts ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'UNLISTED'));

CREATE TABLE blog_post_views (
    post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL,
    PRIMARY KEY (post_id, viewer_id)
);
