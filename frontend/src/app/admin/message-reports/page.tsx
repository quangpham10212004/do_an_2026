"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Flag } from "lucide-react";
import { Alert, Card, EmptyState, Loading, PageHeader, Table, Tabs } from "@/components/ui";
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
      <PageHeader title="Báo cáo tin nhắn" description="Nội dung cuộc trò chuyện chỉ xem được khi hồ sơ kiểm duyệt còn mở." />
      <Alert className="mb-6">{error}</Alert>
      <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={FILTERS.map(([v, l]) => ({ id: v, label: l }))} />
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={Flag} title="Không có báo cáo nào" /> : (
            <Table>
              <thead>
                <tr><th>Báo cáo lúc</th><th>Lý do</th><th>Người báo cáo</th><th>Người gửi</th><th>Trạng thái</th><th>Kết luận</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td>{MESSAGE_REPORT_REASON_LABELS[r.reason]}</td>
                    <td>{r.reporterName || <span className="font-mono text-small">{r.reporterId.slice(0, 8)}</span>}</td>
                    <td>{r.senderName || "—"}</td>
                    <td><MentoringStatusBadge status={r.status} /></td>
                    <td className="text-small">{r.outcome ? MESSAGE_REPORT_OUTCOME_LABELS[r.outcome] : "—"}</td>
                    <td className="actions"><Link className="btn btn-sm" href={`/admin/message-reports/${r.id}`}>Xem</Link></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

export default function AdminMessageReportsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Reports />}</RequireAuth>;
}
