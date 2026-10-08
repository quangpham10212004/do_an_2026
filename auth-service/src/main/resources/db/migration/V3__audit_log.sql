-- US-30 (PRD-ADM-5): nhật ký kiểm toán cho mọi hành động admin và mọi dòng tiền, lưu 2 năm, chỉ đọc.
--
-- Các service ghi qua POST /internal/audit (X-Internal-Token); auth-service ghi trực tiếp hành động admin của mình.
-- Append-only: không có endpoint sửa/xoá và trigger chặn UPDATE / DELETE / TRUNCATE. Ngoại lệ duy nhất là job lưu trữ
-- (AuditRetentionJob) — nó bật cờ phiên `mmp.audit_retention_purge = on` (SET LOCAL trong transaction) và chỉ xoá
-- được dòng cũ hơn 1 năm (chốt chặn cứng; cấu hình mặc định giữ 2 năm).
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID,
    actor_role  TEXT NOT NULL CHECK (actor_role IN ('ADMIN', 'MENTOR', 'MENTEE', 'SYSTEM')),
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    before      JSONB,
    after       JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action, created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE'
       AND current_setting('mmp.audit_retention_purge', true) = 'on'
       AND OLD.created_at < now() - interval '1 year' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update_delete ON audit_log;
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
