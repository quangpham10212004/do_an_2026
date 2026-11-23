-- File đính kèm hội thoại lưu ở object storage (MinIO/S3): hàng chỉ giữ khoá file. File cũ vẫn nằm trong cột content.
ALTER TABLE conversation_attachments ADD COLUMN storage_key TEXT;
ALTER TABLE conversation_attachments ALTER COLUMN content DROP NOT NULL;
ALTER TABLE conversation_attachments ADD CONSTRAINT conversation_attachments_content_check
    CHECK (content IS NOT NULL OR storage_key IS NOT NULL);
