#!/usr/bin/env python3
"""
Xoá tài khoản do script e2e tạo (email `@test.local`) khỏi CSDL dev — mặc định chỉ CHẠY THỬ (rollback) và in số dòng.

    python3 scripts/cleanup_e2e.py                    # chạy thử, mentor e2e
    python3 scripts/cleanup_e2e.py --role ALL         # chạy thử, cả mentor lẫn mentee e2e
    python3 scripts/cleanup_e2e.py --commit           # xoá thật

Vì sao cần: lĩnh vực không còn là ràng buộc cứng của matching, nên mentor e2e tích luỹ qua nhiều lần chạy (mỗi lần một
lĩnh vực riêng) xuất hiện trong gợi ý của tài khoản demo và đẩy mentor demo xuống.

Cách xoá: lấy id từ auth_db (role + email `@test.local`; tài khoản demo `@demo.local` và admin không bao giờ bị chọn),
rồi ở từng CSDL xoá mọi dòng có cột uuid chứa một trong các id đó — trước đó xoá các dòng phụ thuộc theo khoá ngoại
(vd. tin nhắn của yêu cầu mentoring). Mỗi CSDL một transaction; CSDL nào lỗi thì rollback riêng CSDL đó.

Bảng append-only (có trigger `*_append_only` chặn DELETE, vd. auth_db.audit_log) được giữ nguyên và chỉ báo số dòng
giữ lại. payment_db bị bỏ qua hẳn: ví/sổ cái (wallets → wallet_entries, mentor_ledger) là append-only nên không xoá được
phần nào cho nhất quán — lịch sử thanh toán của tài khoản e2e được giữ lại, không ảnh hưởng matching. Chỉ dùng trên môi trường dev (`docker compose`), không dùng cho production.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
E2E_EMAIL = "%@test.local"
# (service docker compose, tên CSDL) — payment-db bỏ qua (xem docstring).
DATABASES = [("auth-db", "auth_db"), ("profile-db", "profile_db"), ("mentoring-db", "mentoring_db"),
             ("learning-db", "learning_db"), ("ai-db", "ai_db"), ("matching-db", "matching_db")]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# Xoá đệ quy theo khoá ngoại: con trước, cha sau; đếm số dòng xoá theo bảng vào bảng tạm e2e_counts.
DELETE_FN = r"""
CREATE TEMP TABLE e2e_counts (tbl text, n bigint);
CREATE FUNCTION pg_temp.e2e_del(tbl regclass, cond text, ids uuid[], depth int) RETURNS void AS $fn$
DECLARE
    fk record;
    n bigint;
BEGIN
    IF depth > 12 THEN
        RAISE EXCEPTION 'FK chain too deep at %', tbl;
    END IF;
    -- Bảng append-only: giữ nguyên, chỉ đếm. Nếu nó là bảng con theo khoá ngoại thì DELETE ở bảng cha sẽ lỗi và cả CSDL rollback.
    IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
               WHERE t.tgrelid = tbl AND NOT t.tgisinternal AND p.proname LIKE '%\_append\_only') THEN
        EXECUTE format('SELECT count(*) FROM %s WHERE %s', tbl, cond) USING ids INTO n;
        IF n > 0 THEN
            INSERT INTO e2e_counts VALUES (tbl::text || ' (giữ lại, append-only)', n);
        END IF;
        RETURN;
    END IF;
    FOR fk IN
        SELECT c.conrelid::regclass AS child,
               string_agg(quote_ident(ca.attname), ', ' ORDER BY k.ord) AS ccols,
               string_agg(quote_ident(pa.attname), ', ' ORDER BY k.ord) AS pcols
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(ck, pk, ord)
        JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = k.ck
        JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.pk
        WHERE c.contype = 'f' AND c.confrelid = tbl AND c.conrelid <> tbl
        GROUP BY c.oid, c.conrelid
    LOOP
        PERFORM pg_temp.e2e_del(fk.child, format('(%s) IN (SELECT %s FROM %s WHERE %s)', fk.ccols, fk.pcols, tbl, cond),
                                ids, depth + 1);
    END LOOP;
    EXECUTE format('DELETE FROM %s WHERE %s', tbl, cond) USING ids;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
        INSERT INTO e2e_counts VALUES (tbl::text, n);
    END IF;
END
$fn$ LANGUAGE plpgsql;
"""

DELETE_ALL = r"""
DO $do$
DECLARE
    col record;
BEGIN
    FOR col IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = 'public' AND c.data_type = 'uuid' AND t.table_type = 'BASE TABLE'
    LOOP
        PERFORM pg_temp.e2e_del(format('public.%I', col.table_name)::regclass,
                                format('%I = ANY($1)', col.column_name), '{ids}'::uuid[], 0);
    END LOOP;
END
$do$;
SELECT tbl || '=' || sum(n) FROM e2e_counts GROUP BY tbl ORDER BY tbl;
"""


def psql(service: str, database: str, sql: str) -> list[str]:
    res = subprocess.run(
        ["docker", "compose", "exec", "-T", service, "psql", "-U", "postgres", "-d", database,
         "-v", "ON_ERROR_STOP=1", "-Atq"],
        input=sql, text=True, capture_output=True, cwd=ROOT)
    if res.returncode != 0:
        # Dòng đầu là thông báo lỗi; phần CONTEXT phía sau lặp lại cả danh sách id.
        raise RuntimeError(res.stderr.strip().splitlines()[0] if res.stderr.strip() else f"psql exited {res.returncode}")
    return [line for line in res.stdout.splitlines() if line]


def e2e_ids(role: str) -> list[str]:
    roles = "('MENTOR', 'MENTEE')" if role == "ALL" else f"('{role}')"
    ids = psql("auth-db", "auth_db",
               f"SELECT id FROM users WHERE email LIKE '{E2E_EMAIL}' AND role IN {roles} ORDER BY id;")
    bad = [i for i in ids if not UUID.match(i)]
    if bad:
        raise RuntimeError(f"id không hợp lệ từ auth_db: {bad[:3]}")
    return ids


def main() -> int:
    parser = argparse.ArgumentParser(description="Xoá tài khoản e2e (@test.local) khỏi CSDL dev.")
    parser.add_argument("--role", choices=["MENTOR", "MENTEE", "ALL"], default="MENTOR")
    parser.add_argument("--commit", action="store_true", help="xoá thật (mặc định chỉ chạy thử rồi rollback)")
    args = parser.parse_args()

    ids = e2e_ids(args.role)
    print(f"{len(ids)} tài khoản e2e ({args.role}) — {'XOÁ THẬT' if args.commit else 'CHẠY THỬ (rollback)'}")
    if not ids:
        return 0
    failed = False
    for service, database in DATABASES:
        sql = ("BEGIN;\n" + DELETE_FN + DELETE_ALL.replace("{ids}", "{" + ",".join(ids) + "}")
               + ("COMMIT;\n" if args.commit else "ROLLBACK;\n"))
        try:
            counts = psql(service, database, sql)
            print(f"  {database}: {', '.join(counts) or 'không có gì'}")
        except RuntimeError as e:
            failed = True
            print(f"  {database}: LỖI, đã rollback — {e}", file=sys.stderr)
    if not args.commit:
        print("Chạy lại với --commit để xoá thật.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
