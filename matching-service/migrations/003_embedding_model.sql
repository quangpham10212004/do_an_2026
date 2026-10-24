-- 003 — G10/D13: đổi embedding sang model đa ngôn ngữ (hồ sơ tiếng Việt, tiếng Anh, hoặc trộn đều
-- được hiểu) cần theo dõi model đã dùng cho MỖI vector, vì vector của hai model khác nhau không so
-- sánh được với nhau dù cùng 384 chiều. Không có cột này, đổi model sẽ lặng lẽ trộn lẫn vector cũ và
-- mới trong cùng một lượt tìm (sai) mà không ai biết.
--
-- NULL = embed từ trước khi có cột này (hoặc chưa embed được) — IndexSyncJob.reconcile() coi NULL
-- khác config.EMBEDDING_MODEL hiện tại nên tự xếp vào hàng lập chỉ mục lại, không cần thao tác tay.

ALTER TABLE mentor_embeddings ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE mentee_embeddings ADD COLUMN IF NOT EXISTS model TEXT;
