"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { MESSAGE_REPORT_OUTCOME_LABELS, MESSAGE_REPORT_REASON_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MessageReport, MessageReportStatus } from "@/types";

const FILTERS: [MessageReportStatus | "", string][] = [
  ["OPEN", "Cần xử lý"],
  ["RESOLVED", "Đã xử lý"],
  ["", "Tất cả"],
];

/** US-33 (PRD-MSG-4) — hàng đợi kiểm duyệt tin nhắn bị báo cáo. */
function Reports() {
  const [filter, setFilter] = useState<MessageReportStatus | "">("OPEN");
  const [items, setItems] = useState<MessageReport[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(null);
    setError("");
    mentoringApi.adminMessageReports(filter).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [filter]);

  return (
    <>
      <PageHead title="Tin nhắn bị báo cáo" subtitle="Nội dung cuộc trò chuyện chỉ xem được khi hồ sơ còn mở." />
      <Alert>{error}</Alert>
      <div className="tabs">
        {FILTERS.map(([v, l]) => (
          <button key={v || "ALL"} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {!items ? <Loading /> : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Báo cáo lúc</th><th>Lý do</th><th>Người báo cáo</th><th>Người gửi</th><th>Trạng thái</th><th>Kết luận</th><th></th></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center" }}>Không có báo cáo nào.</td></tr>}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td>{MESSAGE_REPORT_REASON_LABELS[r.reason]}</td>
                  <td className="small">{r.reporterName || r.reporterId.slice(0, 8)}</td>
                  <td className="small">{r.senderName || "—"}</td>
                  <td><MentoringStatusBadge status={r.status} /></td>
                  <td className="small">{r.outcome ? MESSAGE_REPORT_OUTCOME_LABELS[r.outcome] : "—"}</td>
                  <td><Link className="btn secondary sm" href={`/admin/message-reports/${r.id}`}>Xem</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminMessageReportsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Reports />}</RequireAuth>;
}
