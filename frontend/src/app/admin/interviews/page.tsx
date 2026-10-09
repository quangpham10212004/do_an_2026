"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, StatusBadge } from "@/components/ui";
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
      <PageHead title="Duyệt mentor (AI Interview)" subtitle="Kết quả AI chỉ là thông tin hỗ trợ — quyết định kích hoạt cuối cùng thuộc về quản trị viên." />
      {stats && (
        <div className="card small" style={{ marginBottom: "1rem" }}>
          <strong>Đồng thuận admin – AI:</strong> {formatAgreement(stats)} · mục tiêu ≥ 80%
          <span className="muted"> — chỉ tính các buổi AI khuyến nghị duyệt/từ chối; {stats.decisionsOnNeedsReview} quyết định trên buổi &quot;Cần xem xét&quot; không tính; yêu cầu làm lại tính là không đồng thuận.</span>
        </div>
      )}
      <div className="tabs">
        {TABS.map(([v, l]) => (
          <button key={v} className={status === v ? "active" : ""} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      <Alert>{error}</Alert>
      {items === undefined ? <Loading /> : items.length === 0 ? (error ? null : <Empty>Không có buổi phỏng vấn nào.</Empty>) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Mentor</th><th>Lĩnh vực</th><th>Trạng thái</th><th>Điểm AI</th><th>AI khuyến nghị</th><th>Hoàn thành</th><th></th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.mentorName || i.mentorId.slice(0, 8)}</td>
                  <td>{i.domain}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{i.overallScore != null ? `${i.overallScore.toFixed(1)}/100` : `${i.currentTurn - 1}/${i.maxTurns} câu`}</td>
                  <td>{i.recommendation ? <StatusBadge status={i.recommendation} /> : "—"}</td>
                  <td>{formatDateTime(i.completedAt)}</td>
                  <td><Link className="btn sm" href={`/admin/interviews/${i.id}`}>Xem</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
