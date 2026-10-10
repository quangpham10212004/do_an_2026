"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Scale } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Loading, PageHeader, Table, Tabs } from "@/components/ui";
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
      <PageHeader title="Tranh chấp" description="Báo cáo sự cố và phiên có xác nhận tham dự mâu thuẫn. Phản hồi đầu tiên trong 48 giờ." />
      <div className="mb-6 flex flex-col gap-2 empty:hidden">
        <Alert>{error}</Alert>
        {overdue > 0 && <Alert tone="warning">{overdue} tranh chấp đã quá hạn phản hồi 48 giờ.</Alert>}
      </div>
      <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={FILTERS.map(([v, l]) => ({ id: v, label: l }))} />
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={Scale} title="Không có tranh chấp nào" /> : (
            <Table>
              <thead>
                <tr><th>Mở lúc</th><th>Loại</th><th>Người mở</th><th>Phiên</th><th>Trạng thái</th><th>Hạn phản hồi</th><th>Kết luận</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{formatDateTime(d.createdAt)}</td>
                    <td>{DISPUTE_TYPE_LABELS[d.type]}</td>
                    <td className="text-small">{d.openedByName || "—"} <span className="text-ink-muted">· {d.openedByRole === "SYSTEM" ? "hệ thống" : d.openedByRole.toLowerCase()}</span></td>
                    <td className="min-w-[200px] text-small">
                      {d.session ? <>
                        <div>{d.session.menteeName} ↔ {d.session.mentorName}</div>
                        <div className="text-ink-muted">{formatDateTime(d.session.scheduledAt)} · {formatMoney(d.session.price)}</div>
                      </> : <span className="font-mono">{d.sessionId.slice(0, 8)}</span>}
                    </td>
                    <td><MentoringStatusBadge status={d.status} /></td>
                    <td className="whitespace-nowrap text-small">
                      {formatDateTime(d.firstResponseDueAt)}
                      {d.overdue && <div className="mt-1"><Badge tone="danger">Quá hạn</Badge></div>}
                    </td>
                    <td className="text-small">{d.outcome ? DISPUTE_OUTCOME_LABELS[d.outcome] : "—"}</td>
                    <td className="actions"><Link className="btn btn-sm" href={`/admin/disputes/${d.id}`}>Xem</Link></td>
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

export default function AdminDisputesPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Disputes />}</RequireAuth>;
}
