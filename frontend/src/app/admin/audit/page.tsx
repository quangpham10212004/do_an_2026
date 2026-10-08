"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
import { authApi, type AuditFilters } from "@/features/auth/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { AuditEntry, JsonObject, PageResponse } from "@/types";

const EMPTY: AuditFilters = { actorId: "", action: "", targetType: "", targetId: "", from: "", to: "", page: 0 };

function show(value: unknown): string {
  if (value === undefined) return "∅";
  if (value === null) return "null";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** before/after dạng diff gọn: chỉ các khoá thay đổi "khoá: cũ → mới"; khoá chỉ có một phía hiển thị như thêm/bớt. */
function Diff({ before, after }: { before: JsonObject | null; after: JsonObject | null }) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  const changed = keys.filter((k) => show(before?.[k]) !== show(after?.[k]));
  const same = keys.length - changed.length;
  if (!keys.length) return <span className="muted">—</span>;
  return (
    <div className="small" style={{ fontFamily: "monospace", wordBreak: "break-word" }}>
      {changed.map((k) => (
        <div key={k}>
          <strong>{k}</strong>:{" "}
          {before && k in before ? <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{show(before[k])}</span> : null}
          {before && k in before && after && k in after ? " → " : null}
          {after && k in after ? <span>{show(after[k])}</span> : null}
        </div>
      ))}
      {same > 0 && (
        <details>
          <summary className="muted">{same} trường không đổi</summary>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(after ?? before, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function Audit() {
  const params = useSearchParams();
  const [form, setForm] = useState<AuditFilters>({
    ...EMPTY,
    actorId: params.get("actorId") || "",
    action: params.get("action") || "",
    targetType: params.get("targetType") || "",
    targetId: params.get("targetId") || "",
  });
  const [filters, setFilters] = useState<AuditFilters>(form);
  const [data, setData] = useState<PageResponse<AuditEntry> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setData(null);
    authApi.adminAudit(filters).then((d) => { setData(d); setError(""); }).catch((e: unknown) => { setError(errorMessage(e)); setData(null); });
  }, [filters]);
  useEffect(() => {
    load();
  }, [load]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setFilters({ ...form, page: 0 });
  }

  const field = (key: keyof Omit<AuditFilters, "page">, label: string, type = "text") => (
    <div className="field" style={{ minWidth: 150, flex: 1 }}>
      <label>{label}</label>
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <>
      <PageHead title="Nhật ký kiểm toán" subtitle="Mọi hành động quản trị và mọi dòng tiền — chỉ đọc, lưu 2 năm." />
      <form className="card" onSubmit={submit} style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "end" }}>
          {field("action", "Hành động (vd. USER_LOCKED)")}
          {field("targetType", "Loại đối tượng (vd. INTERVIEW)")}
          {field("targetId", "Mã đối tượng")}
          {field("actorId", "Mã người thực hiện")}
          {field("from", "Từ ngày", "date")}
          {field("to", "Đến ngày", "date")}
        </div>
        <div className="row">
          <button className="btn">Lọc</button>
          <button type="button" className="btn secondary" onClick={() => { setForm(EMPTY); setFilters(EMPTY); }}>Xoá bộ lọc</button>
        </div>
      </form>
      <Alert>{error}</Alert>
      {!data ? (error ? null : <Loading />) : data.items.length === 0 ? <Empty>Không có dòng nhật ký nào.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Thay đổi (trước → sau)</th></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="small">{formatDateTime(a.createdAt)}</td>
                  <td className="small">{a.actorEmail || (a.actorId ? a.actorId.slice(0, 8) : "—")}<div className="muted">{a.actorRole}</div></td>
                  <td><code>{a.action}</code></td>
                  <td className="small">{a.targetType}<div className="muted" style={{ wordBreak: "break-all" }}>{a.targetId}</div></td>
                  <td style={{ maxWidth: 420 }}><Diff before={a.before} after={a.after} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row between small" style={{ marginTop: 8 }}>
            <span className="muted">{data.totalItems} dòng · trang {data.page + 1}/{Math.max(data.totalPages, 1)}</span>
            <div className="row">
              <button className="btn sm secondary" disabled={data.page === 0} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>← Trước</button>
              <button className="btn sm secondary" disabled={data.page + 1 >= data.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Sau →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminAuditPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Suspense fallback={<Loading />}>
        <Audit />
      </Suspense>
    </RequireAuth>
  );
}
