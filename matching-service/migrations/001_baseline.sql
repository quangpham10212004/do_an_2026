-- 001 baseline (US-11) = bản sao db/init/matching-service.sql tại thời điểm thêm migration runner.
-- Idempotent (IF NOT EXISTS) nên áp dụng được cả trên CSDL đã tạo bằng db/init.
-- KHÔNG sửa file đã áp dụng: runner (app/migrations.py) lưu checksum trong schema_migrations;
-- thay đổi schema viết thành file NNN_ten.sql mới.

-- matching-service database init (matching_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)
--
-- matching-service sở hữu TOÀN BỘ chỉ mục embedding (CONVENTIONS.md mục 1 & 7):
-- vector, hash của text nguồn và trạng thái index đều nằm ở đây, không nằm trong
-- DB của profile-service. profile-service chỉ sở hữu dữ liệu hồ sơ.
--
-- Nguồn sự thật của text đầu vào vẫn là mentor_profiles/mentee_profiles trong
-- profile_db, được đọc READ-ONLY bằng role `matching_reader`. text_hash cho phép
-- phát hiện hồ sơ đã đổi nội dung mà không cần embed lại (NFR-7).

CREATE EXTENSION IF NOT EXISTS vector;

-- Chỉ mục embedding của mentor. user_id tham chiếu mentor_profiles.user_id ở
-- profile_db — không thể dùng FOREIGN KEY (khác database), nên IndexSyncJob dọn
-- các dòng có hồ sơ đã bị xoá.
CREATE TABLE IF NOT EXISTS mentor_embeddings (
    user_id     UUID PRIMARY KEY,
    embedding   VECTOR(384),                              -- NULL = chưa embed được, chờ retry
    text_hash   TEXT,                                     -- SHA-256 của text chuẩn hoá đã embed
    indexed_at  TIMESTAMPTZ,                              -- lần embed thành công gần nhất
    attempts    INTEGER NOT NULL DEFAULT 0,               -- số lần thử lại liên tiếp bị lỗi
    last_error  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentee_embeddings (
    user_id     UUID PRIMARY KEY,
    embedding   VECTOR(384),
    text_hash   TEXT,
    indexed_at  TIMESTAMPTZ,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index để similarity search nhanh — dùng cosine distance (khớp với toán tử
-- <=> trong matching_pipeline.py). Chỉ mentor_embeddings được quét ở bước top-K;
-- mentee chỉ tra cứu theo khoá chính nên không cần HNSW.
CREATE INDEX IF NOT EXISTS idx_mentor_embeddings_vector
    ON mentor_embeddings USING hnsw (embedding vector_cosine_ops);

-- IndexSyncJob quét các dòng chưa embed được để thử lại.
CREATE INDEX IF NOT EXISTS idx_mentor_embeddings_pending
    ON mentor_embeddings (updated_at) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS idx_mentee_embeddings_pending
    ON mentee_embeddings (updated_at) WHERE embedding IS NULL;
