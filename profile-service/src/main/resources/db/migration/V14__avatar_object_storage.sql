-- Ảnh đại diện lưu ở object storage (MinIO/S3): hàng chỉ giữ khoá file. Ảnh cũ vẫn nằm trong cột data (storage_key NULL).
ALTER TABLE profile_avatars ADD COLUMN storage_key TEXT;
ALTER TABLE profile_avatars ALTER COLUMN data DROP NOT NULL;
ALTER TABLE profile_avatars DROP CONSTRAINT IF EXISTS profile_avatars_data_check;
ALTER TABLE profile_avatars ADD CONSTRAINT profile_avatars_content_check CHECK (
    (storage_key IS NOT NULL AND data IS NULL)
    OR (storage_key IS NULL AND data IS NOT NULL AND octet_length(data) BETWEEN 1 AND 2097152));
