"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { KeyRound, Mail, ScrollText, Search, ShieldOff, Wallet, X } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, FlashAlerts, Input, Loading, Modal, PageHeader, Pagination, Select, StatusBadge, Table, Textarea, useDialog, type Flash } from "@/components/ui";
import { authApi, type UserFilters } from "@/features/auth/api";
import { SUSPEND_LABELS, adminxApi, userCode, type SuspendDuration, type UserExtra } from "@/features/adminx/api";
import { ROLE_LABELS, formatDate, formatVnd } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { PageResponse, Role, User } from "@/types";

type StatusFilter = "" | "ACTIVE" | "UNVERIFIED" | "LOCKED";
const REASON_MIN = 10;

/** Trạng thái hiển thị theo thiết kế: Hoạt động / Chưa xác thực email / Đình chỉ. */
function UserStatus({ u, extra }: { u: User; extra?: UserExtra }) {
  if (u.status === "LOCKED") {
    return <Badge tone="danger">{extra?.suspendedUntil ? `Đình chỉ đến ${formatDate(extra.suspendedUntil)}` : "Đình chỉ"}</Badge>;
  }
  if (!u.emailVerified) return <Badge tone="warning">Chưa xác thực email</Badge>;
  return <StatusBadge status="ACTIVE" />;
}

function Users() {
  const [filters, setFilters] = useState<Required<UserFilters>>({ role: "", q: "", page: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [data, setData] = useState<PageResponse<User> | null>(null);
  const [extras, setExtras] = useState<Record<string, UserExtra>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>({});
  const [busy, setBusy] = useState("");
  const [suspending, setSuspending] = useState<User | null>(null);
  const [dialog, ask] = useDialog();

  const load = useCallback(
    () => authApi.adminListUsers(filters).then(async (d) => {
      setData(d);
      setExtras(await adminxApi.userExtras(d.items).catch(() => ({})));
    }).catch((e: unknown) => setFlash({ error: errorMessage(e) })),
    [filters],
  );
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (data?.items ?? []).filter((u) => {
    if (statusFilter === "LOCKED") return u.status === "LOCKED";
    if (statusFilter === "UNVERIFIED") return u.status === "ACTIVE" && !u.emailVerified;
    if (statusFilter === "ACTIVE") return u.status === "ACTIVE" && u.emailVerified;
    return true;
  }), [data, statusFilter]);
  const selected = data?.items.find((u) => u.id === selectedId) ?? null;
  const selExtra = selected ? extras[selected.id] : undefined;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !suspending && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, suspending]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setFlash({});
    try {
      await fn();
      setFlash({ ok });
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy("");
    }
  }

  async function unlock(u: User) {
    const yes = await ask({ title: `Mở khoá ${u.email}?`, message: "Người dùng đăng nhập lại được ngay.", confirmText: "Mở khoá" });
    if (!yes) return;
    await run("unlock", async () => { await authApi.adminSetStatus(u.id, "ACTIVE"); await load(); }, "Đã mở khoá tài khoản.");
  }

  return (
    <>
      {dialog}
      <PageHeader title="Người dùng" description="Tra cứu, đình chỉ và hỗ trợ tài khoản." />
      <FlashAlerts flash={flash} className="mb-6" />
      <div className="adm-filter">
        <div className="adm-search">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input type="search" aria-label="Tìm người dùng" placeholder="Tìm tên, email hoặc mã" value={filters.q} className="pl-9"
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 0 })} />
        </div>
        <Select aria-label="Vai trò" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value as Role | "", page: 0 })} className="w-auto min-w-[160px]">
          <option value="">Mọi vai trò</option>
          <option value="MENTEE">Mentee</option>
          <option value="MENTOR">Mentor</option>
          <option value="ADMIN">Quản trị viên</option>
        </Select>
        <Select aria-label="Trạng thái" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-auto min-w-[200px]">
          <option value="">Mọi trạng thái</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="UNVERIFIED">Chưa xác thực email</option>
          <option value="LOCKED">Đình chỉ</option>
        </Select>
        {data && <span className="adm-count">{statusFilter ? `${rows.length} trong trang này` : `${data.totalItems.toLocaleString("vi-VN")} người dùng`}</span>}
      </div>
      {!data ? (flash.error ? null : <Loading />) : (
        <div className={`adm-split${selected ? " has-detail" : ""}`}>
          <Card>
            <Table>
              <thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Tham gia</th><th className="num">Phiên</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={5} className="text-ink-muted">Không có người dùng phù hợp.</td></tr>}
                {rows.map((u) => (
                  <tr key={u.id} className="adm-row-sel" tabIndex={0} aria-selected={u.id === selectedId}
                    onClick={() => setSelectedId(u.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(u.id); } }}>
                    <td>
                      <div className="adm-person">
                        <Avatar name={u.fullName || u.email} size="sm" />
                        <div className="min-w-0">
                          <div className="font-semibold">{u.fullName || "—"}</div>
                          <div className="adm-sub">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td><UserStatus u={u} extra={extras[u.id]} /></td>
                    <td className="whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="num">{extras[u.id]?.sessions ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} summary={`${data.totalItems.toLocaleString("vi-VN")} người dùng · trang ${data.page + 1}/${Math.max(data.totalPages, 1)}`}
              onChange={(p) => setFilters({ ...filters, page: p })} />
          </Card>

          {selected && (
            <>
              <div className="adm-detail-backdrop" onClick={() => setSelectedId(null)} />
              <aside className="adm-detail" aria-label="Chi tiết người dùng">
                <div className="adm-detail-head">
                  <Avatar name={selected.fullName || selected.email} size="lg" />
                  <div className="grow">
                    <div className="font-semibold">{selected.fullName || "—"}</div>
                    <div className="text-small text-ink-muted">{ROLE_LABELS[selected.role]} · {selected.email}</div>
                    <div className="mt-1"><UserStatus u={selected} extra={selExtra} /></div>
                  </div>
                  <Button variant="ghost" size="sm" iconOnly icon={X} label="Đóng chi tiết" onClick={() => setSelectedId(null)} />
                </div>
                <dl className="adm-dl">
                  <dt>Mã</dt><dd className="mono">{selExtra?.code ?? userCode(selected.id)}</dd>
                  <dt>Tham gia</dt><dd>{formatDate(selected.createdAt)}</dd>
                  <dt>Email</dt><dd>{selected.emailVerified ? "Đã xác thực" : "Chưa xác thực"}</dd>
                  <dt>Phiên</dt><dd>{selExtra?.sessions ?? "—"}</dd>
                  <dt>Số dư ví</dt><dd>{selExtra ? formatVnd(selExtra.walletBalance) : "—"}</dd>
                  <dt>Vi phạm liên hệ</dt><dd>{selExtra ? (selExtra.contactViolations ? `${selExtra.contactViolations} lần` : "Không") : "—"}</dd>
                </dl>
                <div className="adm-detail-actions">
                  <ButtonLink variant="secondary" icon={Wallet} href="/admin/transactions">Xem giao dịch và ví</ButtonLink>
                  <ButtonLink variant="ghost" icon={ScrollText} href={`/admin/audit?targetType=USER&targetId=${selected.id}`}>Nhật ký</ButtonLink>
                  {!selected.emailVerified && (
                    <Button variant="secondary" icon={Mail} loading={busy === "resend"}
                      onClick={() => run("resend", () => adminxApi.resendVerification(selected.id), "Đã gửi lại email xác thực.")}>Gửi lại email xác thực</Button>
                  )}
                  <Button variant="secondary" icon={KeyRound} loading={busy === "reset"}
                    onClick={() => run("reset", () => adminxApi.resetPassword(selected.id), "Đã gửi email đặt lại mật khẩu.")}>Đặt lại mật khẩu</Button>
                  {selected.role !== "ADMIN" && (selected.status === "ACTIVE"
                    ? <Button variant="danger-quiet" icon={ShieldOff} onClick={() => setSuspending(selected)}>Đình chỉ tài khoản…</Button>
                    : <Button variant="secondary" loading={busy === "unlock"} onClick={() => unlock(selected)}>Mở khoá tài khoản</Button>)}
                </div>
              </aside>
            </>
          )}
        </div>
      )}
      {suspending && (
        <SuspendDialog user={suspending} onClose={() => setSuspending(null)} onDone={async (duration, reason) => {
          const u = suspending;
          setSuspending(null);
          await run("suspend", async () => { await adminxApi.suspendUser(u.id, duration, reason); await load(); }, `Đã đình chỉ ${u.fullName || u.email} (${SUSPEND_LABELS[duration]}).`);
        }} />
      )}
    </>
  );
}

function SuspendDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (d: SuspendDuration, reason: string) => void }) {
  const [duration, setDuration] = useState<SuspendDuration>("30d");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (reason.trim().length < REASON_MIN) return setError(`Lý do cần ít nhất ${REASON_MIN} ký tự.`);
    onDone(duration, reason.trim());
  };
  return (
    <Modal title={`Đình chỉ ${user.fullName || user.email}?`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Huỷ</Button>
      <Button variant="danger" onClick={submit}>Đình chỉ {duration === "permanent" ? "vĩnh viễn" : SUSPEND_LABELS[duration]}</Button>
    </>}>
      <p className="text-ink-muted">Người dùng không đăng nhập được. Phiên sắp tới và tiền đang giữ được xử lý theo chính sách huỷ.</p>
      <div role="radiogroup" aria-label="Thời hạn" className="adm-opts mt-4">
        {(Object.keys(SUSPEND_LABELS) as SuspendDuration[]).map((d) => (
          <label key={d} className="adm-opt">
            <input type="radio" name="duration" checked={duration === d} onChange={() => setDuration(d)} />
            <b>{SUSPEND_LABELS[d]}</b>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-small font-medium" htmlFor="suspend-reason">Lý do * <span className="font-normal text-ink-muted">(người dùng và nhật ký đều thấy)</span></label>
      <Textarea id="suspend-reason" rows={3} maxLength={500} value={reason} className="mt-1" onChange={(e) => { setReason(e.target.value); setError(""); }} />
      <Alert className="mt-3">{error}</Alert>
    </Modal>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Users />
    </RequireAuth>
  );
}
