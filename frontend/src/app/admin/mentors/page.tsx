"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, FlashAlerts, Input, Loading, PageHeader, Pagination, Select, StatusBadge, Table, useDialog, type Flash } from "@/components/ui";
import { MENTOR_STATUS_LABELS, domainLabel, mentorStatusText, profileApi } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AdminMentorFilters, AdminMentorRow, MentorStatus, PageResponse, VerificationStatus } from "@/types";

const REASON_MIN = 10;
const REASON_MAX = 500;
const STATUSES: MentorStatus[] = ["ACCEPTING", "PAUSED", "ON_LEAVE", "SUSPENDED"];
const VERIFICATIONS: [VerificationStatus, string][] = [
  ["APPROVED", "Đã duyệt"],
  ["PENDING_REVIEW", "Chờ admin duyệt"],
  ["PENDING_INTERVIEW", "Chưa phỏng vấn"],
  ["REJECTED", "Từ chối"],
];

/** US-27 (PRD-ADM-3) — admin xem mentor và tạm ngưng / gỡ tạm ngưng. */
function AdminMentors() {
  const [filters, setFilters] = useState<Required<AdminMentorFilters>>({ q: "", status: "", verification: "", page: 0 });
  const [data, setData] = useState<PageResponse<AdminMentorRow> | null>(null);
  const [flash, setFlash] = useState<Flash>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, ask] = useDialog();

  const load = useCallback(
    () => profileApi.adminListMentors(filters).then(setData).catch((e: unknown) => setFlash({ error: errorMessage(e) })),
    [filters],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function suspend(m: AdminMentorRow) {
    setFlash({});
    let reason: string | null = "";
    // Hỏi lại tới khi lý do hợp lệ hoặc admin huỷ.
    for (;;) {
      reason = await ask({
        title: `Tạm ngưng mentor ${m.displayName}`,
        message: "Mentor vẫn đăng nhập được nhưng sẽ không được gợi ý, không nhận yêu cầu/đặt lịch mới; các phiên sắp tới sẽ bị huỷ và hoàn 100% cho mentee.",
        input: { label: `Lý do (${REASON_MIN}–${REASON_MAX} ký tự)`, defaultValue: reason || "", maxLength: REASON_MAX },
        confirmText: "Tạm ngưng",
        danger: true,
      });
      if (reason === null) return;
      if (reason.trim().length >= REASON_MIN) break;
      setFlash({ error: `Lý do cần ít nhất ${REASON_MIN} ký tự.` });
    }
    setBusy(m.userId);
    try {
      const res = await profileApi.adminSuspendMentor(m.userId, reason.trim());
      setFlash(res.mentoringNotified
        ? { ok: `Đã tạm ngưng ${m.displayName}. Đã huỷ ${res.cancelledSessions ?? 0} phiên sắp tới.` }
        : { info: res.warning || `Đã tạm ngưng ${m.displayName}.` });
      await load();
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function unsuspend(m: AdminMentorRow) {
    setFlash({});
    const ok = await ask({
      title: `Gỡ tạm ngưng ${m.displayName}?`,
      message: "Mentor trở lại trạng thái Đang nhận mentee và xuất hiện lại trong gợi ý. Các phiên đã huỷ không được khôi phục.",
      confirmText: "Gỡ tạm ngưng",
    });
    if (!ok) return;
    setBusy(m.userId);
    try {
      await profileApi.adminUnsuspendMentor(m.userId);
      setFlash({ ok: `Đã gỡ tạm ngưng ${m.displayName}.` });
      await load();
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Mentor" description="Trạng thái, xác thực và tạm ngưng mentor vi phạm." />
      {dialog}
      <FlashAlerts flash={flash} className="mb-6" />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-[300px]">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input type="search" aria-label="Tìm mentor" placeholder="Tìm theo tên hoặc lĩnh vực" value={filters.q} className="pl-9"
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 0 })} />
        </div>
        <Select aria-label="Trạng thái" value={filters.status} className="w-auto min-w-[180px]" onChange={(e) => setFilters({ ...filters, status: e.target.value as MentorStatus | "", page: 0 })}>
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((st) => <option key={st} value={st}>{MENTOR_STATUS_LABELS[st]}</option>)}
        </Select>
        <Select aria-label="Xác thực" value={filters.verification} className="w-auto min-w-[200px]" onChange={(e) => setFilters({ ...filters, verification: e.target.value as VerificationStatus | "", page: 0 })}>
          <option value="">Mọi trạng thái xác thực</option>
          {VERIFICATIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </Select>
      </div>
      {!data ? (flash.error ? null : <Loading />) : (
        <Card>
          {data.items.length === 0 ? <EmptyState title="Không có mentor nào khớp bộ lọc" /> : (
            <Table>
              <thead>
                <tr><th>Mentor</th><th>Lĩnh vực</th><th>Xác thực</th><th>Trạng thái</th><th className="num">Mentee</th><th>Tạm ngưng</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.userId}>
                    <td><Link href={`/mentors/${m.userId}`} className="font-medium">{m.displayName}</Link></td>
                    <td>{domainLabel(m.domain)}</td>
                    <td><StatusBadge status={m.verificationStatus} /></td>
                    <td>
                      <Badge tone={m.status === "ACCEPTING" ? "success" : m.status === "SUSPENDED" ? "danger" : "neutral"}>
                        {mentorStatusText(m.status, m.onLeaveUntil)}
                      </Badge>
                    </td>
                    <td className="num">{m.activeMenteeCount}/{m.capacity}</td>
                    <td className="min-w-[180px] text-small">
                      {m.status === "SUSPENDED" ? (
                        <>
                          <div>{m.suspendedReason || "—"}</div>
                          <div className="text-ink-muted">{formatDateTime(m.suspendedAt)}{m.suspendedBy ? "" : " · hệ thống"}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="actions">
                      {m.status === "SUSPENDED" ? (
                        <Button size="sm" loading={busy === m.userId} onClick={() => unsuspend(m)}>Gỡ tạm ngưng</Button>
                      ) : (
                        <Button size="sm" variant="danger-quiet" loading={busy === m.userId} onClick={() => suspend(m)}>Tạm ngưng</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} summary={`${data.totalItems} mentor · trang ${data.page + 1}/${Math.max(data.totalPages, 1)}`}
            onChange={(p) => setFilters({ ...filters, page: p })} />
        </Card>
      )}
    </>
  );
}

export default function AdminMentorsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminMentors />
    </RequireAuth>
  );
}
