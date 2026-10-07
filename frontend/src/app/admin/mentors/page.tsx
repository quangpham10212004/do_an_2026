"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge, useDialog, type Flash } from "@/components/ui";
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
      <PageHead title="Quản lý mentor" subtitle="Xem trạng thái, xác thực và tạm ngưng mentor vi phạm." />
      {dialog}
      <Alert type="success">{flash.ok}</Alert>
      <Alert type="info">{flash.info}</Alert>
      <Alert>{flash.error}</Alert>
      <div className="row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <input placeholder="Tìm theo tên hoặc lĩnh vực" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 0 })} style={{ maxWidth: 300 }} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as MentorStatus | "", page: 0 })} style={{ maxWidth: 200 }}>
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => <option key={s} value={s}>{MENTOR_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filters.verification} onChange={(e) => setFilters({ ...filters, verification: e.target.value as VerificationStatus | "", page: 0 })} style={{ maxWidth: 200 }}>
          <option value="">Mọi trạng thái xác thực</option>
          {VERIFICATIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      {!data ? (flash.error ? null : <Loading />) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Mentor</th><th>Lĩnh vực</th><th>Xác thực</th><th>Trạng thái</th><th>Mentee</th><th>Tạm ngưng</th><th></th></tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr><td colSpan={7} className="muted">Không có mentor nào khớp bộ lọc.</td></tr>
              )}
              {data.items.map((m) => (
                <tr key={m.userId}>
                  <td><Link href={`/mentors/${m.userId}`}>{m.displayName}</Link></td>
                  <td>{domainLabel(m.domain)}</td>
                  <td><StatusBadge status={m.verificationStatus} /></td>
                  <td>
                    <span className={`badge ${m.status === "ACCEPTING" ? "good" : m.status === "SUSPENDED" ? "bad" : ""}`}>
                      {mentorStatusText(m.status, m.onLeaveUntil)}
                    </span>
                  </td>
                  <td>{m.activeMenteeCount}/{m.capacity}</td>
                  <td className="small">
                    {m.status === "SUSPENDED" ? (
                      <>
                        <div>{m.suspendedReason || "—"}</div>
                        <div className="muted">{formatDateTime(m.suspendedAt)}{m.suspendedBy ? "" : " · hệ thống"}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td>
                    {m.status === "SUSPENDED" ? (
                      <button className="btn sm good" disabled={busy === m.userId} onClick={() => unsuspend(m)}>Gỡ tạm ngưng</button>
                    ) : (
                      <button className="btn sm danger" disabled={busy === m.userId} onClick={() => suspend(m)}>Tạm ngưng</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row between" style={{ marginTop: "0.75rem" }}>
            <span className="muted small">{data.totalItems} mentor</span>
            <div className="row">
              <button className="btn secondary sm" disabled={data.page === 0} onClick={() => setFilters({ ...filters, page: data.page - 1 })}>Trước</button>
              <span className="small">{data.page + 1}/{Math.max(data.totalPages, 1)}</span>
              <button className="btn secondary sm" disabled={data.page + 1 >= data.totalPages} onClick={() => setFilters({ ...filters, page: data.page + 1 })}>Sau</button>
            </div>
          </div>
        </div>
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
