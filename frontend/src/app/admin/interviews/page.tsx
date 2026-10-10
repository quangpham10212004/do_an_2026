"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ShieldCheck } from "lucide-react";
import { Alert, Card, EmptyState, Loading, PageHeader, StatusBadge, Table, Tabs } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { formatAgreement } from "@/features/ai/InterviewViews";
import type { Interview, InterviewStats, InterviewStatus } from "@/types";

const TABS: [InterviewStatus | "", string][] = [
  ["PENDING_REVIEW", "Chờ duyệt"],
  ["IN_PROGRESS", "Đang phỏng vấn"],
  ["APPROVED", "Đã duyệt"],
  ["REJECTED", "Từ chối"],
  ["RETAKE_REQUESTED", "Yêu cầu làm lại"],
  ["", "Tất cả"],
];

function Interviews() {
  const [status, setStatus] = useState<InterviewStatus | "">("PENDING_REVIEW");
  const [items, setItems] = useState<Interview[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<InterviewStats | null>(null);
  useEffect(() => {
    aiApi.adminStats().then(setStats).catch(() => setStats(null));
  }, []);
  useEffect(() => {
    setItems(undefined);
    setError("");
    aiApi.adminInterviews(status).then(setItems).catch((e) => { setError(errorMessage(e)); setItems([]); });
  }, [status]);

  return (
    <>
      <PageHeader title="Duyệt mentor" description="Kết quả AI Interview chỉ là thông tin hỗ trợ. Quyết định kích hoạt cuối cùng thuộc về quản trị viên." />
      {stats && (
        <Alert tone="info" className="mb-6" title={`Đồng thuận admin – AI: ${formatAgreement(stats)} (mục tiêu ≥ 80%)`}>
          Chỉ tính các buổi AI khuyến nghị duyệt hoặc từ chối; {stats.decisionsOnNeedsReview} quyết định trên buổi “Cần xem xét” không tính; yêu cầu làm lại tính là không đồng thuận.
        </Alert>
      )}
      <Tabs className="mb-4" value={status} onChange={setStatus} tabs={TABS.map(([v, l]) => ({ id: v, label: l }))} />
      <Alert className="mb-4">{error}</Alert>
      {items === undefined ? <Loading /> : (
        <Card>
          {items.length === 0 ? (error ? null : <EmptyState icon={ShieldCheck} title="Không có buổi phỏng vấn nào ở trạng thái này" />) : (
            <Table>
              <thead><tr><th>Mentor</th><th>Lĩnh vực</th><th>Trạng thái</th><th className="num">Điểm AI</th><th>AI khuyến nghị</th><th>Hoàn thành</th><th></th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.mentorName || <span className="font-mono">{i.mentorId.slice(0, 8)}</span>}</td>
                    <td>{i.domain}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="num">{i.overallScore != null ? `${i.overallScore.toFixed(1)}/100` : `${i.currentTurn - 1}/${i.maxTurns} câu`}</td>
                    <td>{i.recommendation ? <StatusBadge status={i.recommendation} /> : "—"}</td>
                    <td className="whitespace-nowrap">{formatDateTime(i.completedAt)}</td>
                    <td className="actions"><Link className="btn btn-sm" href={`/admin/interviews/${i.id}`}>Xem</Link></td>
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

export default function AdminInterviewsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Interviews />
    </RequireAuth>
  );
}
