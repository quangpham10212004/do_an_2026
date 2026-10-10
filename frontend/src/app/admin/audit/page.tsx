"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { ClipboardList, Filter } from "lucide-react";
import { Alert, Button, Card, CardBody, CardFooter, EmptyState, Field, Input, Loading, PageHeader, Pagination, Table } from "@/components/ui";
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
  if (!keys.length) return <span className="text-ink-subtle">—</span>;
  return (
    <div className="font-mono text-[12px] leading-5 break-words">
      {changed.map((k) => (
        <div key={k}>
          <span className="font-semibold">{k}</span>:{" "}
          {before && k in before ? <span className="text-danger line-through">{show(before[k])}</span> : null}
          {before && k in before && after && k in after ? " → " : null}
          {after && k in after ? <span className="text-success">{show(after[k])}</span> : null}
        </div>
      ))}
      {same > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer font-sans text-small text-ink-muted">{same} trường không đổi</summary>
          <pre className="mt-1 rounded-sm bg-surface-sunken p-2 whitespace-pre-wrap">{JSON.stringify(after ?? before, null, 2)}</pre>
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

  const field = (key: keyof Omit<AuditFilters, "page">, label: string, type = "text", placeholder?: string) => (
    <Field label={label} id={`audit-${key}`}>
      <Input id={`audit-${key}`} type={type} placeholder={placeholder} className={type === "text" ? "font-mono text-small" : undefined}
        value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );

  return (
    <>
      <PageHeader title="Nhật ký kiểm toán" description="Mọi hành động quản trị và mọi dòng tiền. Chỉ đọc, lưu 2 năm." />
      <form onSubmit={submit} className="mb-6">
        <Card>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field("action", "Hành động", "text", "USER_LOCKED")}
              {field("targetType", "Loại đối tượng", "text", "INTERVIEW")}
              {field("targetId", "Mã đối tượng")}
              {field("actorId", "Mã người thực hiện")}
              {field("from", "Từ ngày", "date")}
              {field("to", "Đến ngày", "date")}
            </div>
          </CardBody>
          <CardFooter>
            <Button variant="ghost" onClick={() => { setForm(EMPTY); setFilters(EMPTY); }}>Xoá bộ lọc</Button>
            <Button type="submit" variant="primary" icon={Filter}>Lọc</Button>
          </CardFooter>
        </Card>
      </form>
      <Alert className="mb-6">{error}</Alert>
      {!data ? (error ? null : <Loading />) : (
        <Card>
          {data.items.length === 0 ? <EmptyState icon={ClipboardList} title="Không có dòng nhật ký nào" /> : (
            <Table>
              <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Thay đổi (trước → sau)</th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="whitespace-nowrap text-small">{formatDateTime(a.createdAt)}</td>
                    <td className="text-small">{a.actorEmail || (a.actorId ? <span className="font-mono">{a.actorId.slice(0, 8)}</span> : "—")}<div className="text-ink-muted">{a.actorRole}</div></td>
                    <td><code className="rounded-sm bg-surface-sunken px-1.5 py-0.5">{a.action}</code></td>
                    <td className="text-small">{a.targetType}<div className="font-mono break-all text-ink-muted">{a.targetId}</div></td>
                    <td className="max-w-[420px] min-w-[240px]"><Diff before={a.before} after={a.after} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} summary={`${data.totalItems} dòng · trang ${data.page + 1}/${Math.max(data.totalPages, 1)}`}
            onChange={(p) => setFilters({ ...filters, page: p })} />
        </Card>
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
