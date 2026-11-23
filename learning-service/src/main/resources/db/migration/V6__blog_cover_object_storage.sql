-- Ảnh bìa blog lưu ở object storage (MinIO/S3): hàng chỉ giữ khoá file. Ảnh cũ vẫn nằm trong cột content.
ALTER TABLE blog_cover_images ADD COLUMN storage_key TEXT;
ALTER TABLE blog_cover_images ALTER COLUMN content DROP NOT NULL;
ALTER TABLE blog_cover_images ADD CONSTRAINT blog_cover_images_content_check
    CHECK (content IS NOT NULL OR storage_key IS NOT NULL);
