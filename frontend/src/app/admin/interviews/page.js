"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Empty, Loading, PageHead, StatusBadge } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { formatDateTime } from "@/lib/format";

function Interviews() {
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [items, setItems] = useState(undefined);
  useEffect(() => {
    setItems(undefined);
    mentoringApi.adminInterviews(status).then(setItems);
  }, [status]);

  return (
    <>
      <PageHead title="Duyệt mentor (AI Interview)" subtitle="Kết quả AI chỉ là thông tin hỗ trợ — quyết định kích hoạt cuối cùng thuộc về quản trị viên." />
      <div className="tabs">
        {[["PENDING_REVIEW", "Chờ duyệt"], ["IN_PROGRESS", "Đang phỏng vấn"], ["APPROVED", "Đã duyệt"], ["REJECTED", "Từ chối"], ["", "Tất cả"]].map(([v, l]) => (
          <button key={v} className={status === v ? "active" : ""} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {items === undefined ? <Loading /> : items.length === 0 ? <Empty>Không có buổi phỏng vấn nào.</Empty> : (
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
