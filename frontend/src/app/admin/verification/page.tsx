"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ShieldCheck } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Loading, PageHeader, StatusBadge, Table, Tabs } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { formatAgreement } from "@/features/ai/InterviewViews";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ApplicationStatus, InterviewStats, VerificationApplication } from "@/types";

const TABS: [ApplicationStatus | "", string][] = [
  ["ROUND1_REVIEW", "Chờ duyệt vòng 1"],
  ["ROUND1", "Đang làm vòng 1"],
  ["APPROVED", "Đã duyệt"],
  ["REJECTED", "Từ chối"],
  ["CLOSED", "Hết lượt"],
  ["", "Tất cả"],
];

function Applications() {
  const [status, setStatus] = useState<ApplicationStatus | "">("ROUND1_REVIEW");
  const [items, setItems] = useState<VerificationApplication[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<InterviewStats | null>(null);
  useEffect(() => {
    aiApi.adminStats().then(setStats).catch(() => setStats(null));
  }, []);
  useEffect(() => {
    setItems(undefined);
    setError("");
    aiApi.adminApplications(status).then(setItems).catch((e) => { setError(errorMessage(e)); setItems([]); });
  }, [status]);

  return (
    <>
      <PageHeader title="Duyệt mentor" description="Kết quả AI Interview chỉ là thông tin hỗ trợ. Quyết định cuối cùng thuộc về quản trị viên." />
      {stats && (
        <Alert tone="info" className="mb-6" title={`Đồng thuận admin – AI: ${formatAgreement(stats)} (mục tiêu ≥ 80%)`}>
          Chỉ tính các buổi AI khuyến nghị duyệt hoặc từ chối; {stats.decisionsOnNeedsReview} quyết định trên buổi “Cần xem xét” không tính; yêu cầu làm lại tính là không đồng thuận.
        </Alert>
      )}
      <Tabs className="mb-4" value={status} onChange={setStatus} tabs={TABS.map(([v, l]) => ({ id: v, label: l }))} />
      <Alert className="mb-4">{error}</Alert>
      {items === undefined ? <Loading /> : (
        <Card>
          {items.length === 0 ? (error ? null : <EmptyState icon={ShieldCheck} title="Không có đợt xác thực nào ở trạng thái này" />) : (
            <Table>
              <thead><tr><th>Mentor</th><th>Lĩnh vực</th><th>Trạng thái</th><th className="num">Điểm AI</th><th>AI khuyến nghị</th><th className="num">Lần thất bại</th><th>Hoàn thành vòng 1</th><th></th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">
                      {a.mentorName || <span className="font-mono">{a.mentorId.slice(0, 8)}</span>}
                      {a.interview?.flagged && <> <Badge tone="warning">Có cờ</Badge></>}
                    </td>
                    <td>{a.interview?.domain ?? "—"}</td>
                    <td><StatusBadge status={a.status} />{a.retakeCount > 0 && <span className="text-small text-ink-muted"> · làm lại {a.retakeCount}/{a.retakeLimit}</span>}</td>
                    <td className="num">{a.interview?.overallScore != null ? `${a.interview.overallScore.toFixed(1)}/100` : "—"}</td>
                    <td>{a.interview?.recommendation ? <StatusBadge status={a.interview.recommendation} /> : "—"}</td>
                    <td className="num">{a.attemptsUsed}/{a.maxAttempts}</td>
                    <td className="whitespace-nowrap">{formatDateTime(a.interview?.completedAt)}</td>
                    <td className="actions"><Link className="btn btn-sm" href={`/admin/verification/${a.id}`}>Xem</Link></td>
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

export default function AdminVerificationPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Applications />
    </RequireAuth>
  );
}
