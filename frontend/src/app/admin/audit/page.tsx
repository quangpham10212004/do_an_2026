"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { ClipboardList, Download, Search } from "lucide-react";
import { Alert, Button, Card, EmptyState, Input, Loading, PageHeader, Pagination, Select, Table } from "@/components/ui";
import { AUDIT_ACTIONS, auditActionLabel, auditActionTone, describeAudit, listAdmins, type AdminOption } from "@/features/modx/api";
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

/** Xuất các dòng đang hiển thị (trang hiện tại) ra CSV, có BOM để Excel đọc tiếng Việt. */
function exportCsv(items: AuditEntry[]) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Thời gian", "Người thực hiện", "Vai trò", "Hành động", "Loại đối tượng", "Mã đối tượng", "Mô tả", "Trước", "Sau"],
    ...items.map((a) => [a.createdAt, a.actorEmail || a.actorId || "", a.actorRole, a.action, a.targetType, a.targetId, describeAudit(a), a.before ? JSON.stringify(a.before) : "", a.after ? JSON.stringify(a.after) : ""])];
  const blob = new Blob([String.fromCharCode(0xFEFF) + rows.map((r) => r.map(cell).join(",")).join(String.fromCharCode(10))], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "nhat-ky-hoat-dong.csv";
  link.click();
  URL.revokeObjectURL(url);
}

const PERIODS: [string, string][] = [["7", "7 ngày"], ["30", "30 ngày"], ["90", "90 ngày"], ["", "Tất cả"]];
const dayStr = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

function Audit() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<AuditFilters>({
    ...EMPTY,
    actorId: params.get("actorId") || "",
    action: params.get("action") || "",
    targetType: params.get("targetType") || "",
    targetId: params.get("targetId") || "",
  });
  const [period, setPeriod] = useState("");
  const [q, setQ] = useState("");
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [data, setData] = useState<PageResponse<AuditEntry> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listAdmins().then(setAdmins);
  }, []);

  const load = useCallback(() => {
    setData(null);
    authApi.adminAudit(filters).then((d) => { setData(d); setError(""); }).catch((e: unknown) => { setError(errorMessage(e)); setData(null); });
  }, [filters]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch, page: 0 }));
  const names = useMemo(() => new Map(admins.map((a) => [a.id, a.name])), [admins]);
  const actorName = (a: AuditEntry) => (a.actorId && names.get(a.actorId)) || a.actorEmail || (a.actorId ? a.actorId.slice(0, 8) : "Hệ thống");

  // Tìm chung: lọc trong trang đang xem (người thực hiện, thao tác, đối tượng, mô tả). Endpoint dự kiến: tham số q ở GET /api/auth/admin/audit.
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!data || !needle) return data?.items ?? [];
    return data.items.filter((a) => `${actorName(a)} ${a.action} ${auditActionLabel(a.action)} ${a.targetType} ${a.targetId} ${describeAudit(a)}`.toLowerCase().includes(needle));
  }, [data, q, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionOptions = useMemo(() => {
    const extra = filters.action && !AUDIT_ACTIONS[filters.action] ? [filters.action] : [];
    return [...Object.keys(AUDIT_ACTIONS), ...extra];
  }, [filters.action]);
  const adminOptions = useMemo(() => {
    const seen = new Map(admins.map((a) => [a.id, a.name]));
    data?.items.forEach((a) => { if (a.actorId && a.actorRole === "ADMIN" && !seen.has(a.actorId)) seen.set(a.actorId, a.actorEmail || a.actorId.slice(0, 8)); });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [admins, data]);

  return (
    <>
      <PageHeader title="Nhật ký hoạt động" description="Mọi thao tác của quản trị viên và mọi dòng tiền được ghi lại, không sửa được, lưu 2 năm."
        actions={<Button icon={Download} disabled={!items.length} onClick={() => exportCsv(items)}>Xuất CSV</Button>} />
      <div className="adm-toolbar">
        <div className="grow">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <Input aria-label="Tìm" placeholder="Tìm theo người thực hiện hoặc đối tượng" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Loại thao tác" value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">Mọi thao tác</option>
          {actionOptions.map((a) => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
        </Select>
        <Select aria-label="Quản trị viên" value={filters.actorId} onChange={(e) => set({ actorId: e.target.value })}>
          <option value="">Mọi quản trị viên</option>
          {filters.actorId && !adminOptions.some((a) => a.id === filters.actorId) && <option value={filters.actorId}>{filters.actorId.slice(0, 8)}</option>}
          {adminOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select aria-label="Thời gian" value={period} onChange={(e) => { setPeriod(e.target.value); set({ from: e.target.value ? dayStr(Number(e.target.value)) : "", to: "" }); }}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <details className="w-full">
          <summary className="cursor-pointer py-2 text-small text-ink-muted">Bộ lọc nâng cao</summary>
          <div className="adm-filter mb-0 mt-2 border-0 p-0">
            <label className="flex flex-col gap-1 text-small">Loại đối tượng
              <Input className="font-mono text-small" placeholder="INTERVIEW" value={filters.targetType} onChange={(e) => set({ targetType: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-small">Mã đối tượng
              <Input className="font-mono text-small" value={filters.targetId} onChange={(e) => set({ targetId: e.target.value })} /></label>
          </div>
        </details>
      </div>
      <Alert className="mb-6">{error}</Alert>
      {!data ? (error ? null : <Loading />) : (
        <Card>
          {items.length === 0 ? <EmptyState icon={ClipboardList} title="Không có dòng nhật ký nào" /> : (
            <Table>
              <thead><tr><th>Thời gian</th><th>Quản trị viên</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="whitespace-nowrap text-small">{formatDateTime(a.createdAt)}</td>
                    <td className="text-small">{actorName(a)}<div className="text-ink-muted">{a.actorRole}</div></td>
                    <td><span className={`adm-pill ${auditActionTone(a.action) === "neutral" ? "" : auditActionTone(a.action)}`} title={a.action}>{auditActionLabel(a.action)}</span></td>
                    <td className="text-small">{a.targetType}<div className="font-mono break-all text-ink-muted">{a.targetId}</div></td>
                    <td className="max-w-[420px] min-w-[260px] text-small">
                      <div className="text-ink-muted">{describeAudit(a)}</div>
                      {(a.before || a.after) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-accent-ink">Xem thay đổi chi tiết</summary>
                          <div className="mt-1"><Diff before={a.before} after={a.after} /></div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} summary={`Hiển thị ${items.length} / ${data.totalItems} thao tác · trang ${data.page + 1}/${Math.max(data.totalPages, 1)}`}
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
