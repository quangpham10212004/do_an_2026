CREATE TABLE blog_cover_images (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    media_type VARCHAR(32) NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX blog_cover_images_owner_recent ON blog_cover_images(owner_id, created_at DESC);
