"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { DISPUTE_OUTCOME_LABELS, DISPUTE_TYPE_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Dispute, DisputeStatus } from "@/types";

const FILTERS: [DisputeStatus | "ACTIVE" | "", string][] = [
  ["ACTIVE", "Cần xử lý"],
  ["OPEN", "Đang mở"],
  ["IN_REVIEW", "Đang xem xét"],
  ["RESOLVED", "Đã giải quyết"],
  ["", "Tất cả"],
];

/** US-32 — danh sách tranh chấp + SLA phản hồi đầu tiên 48 giờ. */
function Disputes() {
  const [filter, setFilter] = useState<DisputeStatus | "ACTIVE" | "">("ACTIVE");
  const [items, setItems] = useState<Dispute[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(null);
    setError("");
    mentoringApi.adminDisputes(filter).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [filter]);

  const overdue = items?.filter((d) => d.overdue && d.status !== "RESOLVED").length ?? 0;

  return (
    <>
      <PageHead title="Tranh chấp" subtitle="Báo cáo sự cố của mentee / mentor và phiên có xác nhận tham dự mâu thuẫn. Phản hồi đầu tiên trong 48 giờ." />
      <Alert>{error}</Alert>
      {overdue > 0 && <Alert type="warn">{overdue} tranh chấp đã quá hạn phản hồi 48 giờ.</Alert>}
      <div className="tabs">
        {FILTERS.map(([v, l]) => (
          <button key={v || "ALL"} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {!items ? <Loading /> : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Mở lúc</th><th>Loại</th><th>Người mở</th><th>Phiên</th><th>Trạng thái</th><th>Hạn phản hồi</th><th>Kết luận</th><th></th></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center" }}>Không có tranh chấp nào.</td></tr>}
              {items.map((d) => (
                <tr key={d.id}>
                  <td>{formatDateTime(d.createdAt)}</td>
                  <td>{DISPUTE_TYPE_LABELS[d.type]}</td>
                  <td className="small">{d.openedByName || "—"} · {d.openedByRole === "SYSTEM" ? "hệ thống" : d.openedByRole.toLowerCase()}</td>
                  <td className="small">
                    {d.session ? <>{d.session.menteeName} ↔ {d.session.mentorName}<br />{formatDateTime(d.session.scheduledAt)} · {formatMoney(d.session.price)}</> : d.sessionId.slice(0, 8)}
                  </td>
                  <td><MentoringStatusBadge status={d.status} /></td>
                  <td className="small">
                    {formatDateTime(d.firstResponseDueAt)}
                    {d.overdue && <> <span className="badge bad">Quá hạn</span></>}
                  </td>
                  <td className="small">{d.outcome ? DISPUTE_OUTCOME_LABELS[d.outcome] : "—"}</td>
                  <td><Link className="btn secondary sm" href={`/admin/disputes/${d.id}`}>Xem</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminDisputesPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Disputes />}</RequireAuth>;
}
