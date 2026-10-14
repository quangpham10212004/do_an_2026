"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Badge, ButtonLink, Card, EmptyState, Loading, PageHeader, Table } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { MOCK_TYPE_LABELS, MOCK_VERDICT_LABELS, MOCK_VERDICT_TONE } from "@/features/mentoring/mockLabels";
import { formatDate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MockHistoryItem } from "@/types";

/** US-58 (PRD-PREP-4) — lịch sử phỏng vấn thử của mentee, mới nhất trước, kèm thay đổi điểm tổng so với lần trước cùng dạng. */
function MockHistory() {
  const [items, setItems] = useState<MockHistoryItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    mentoringApi.mockHistory().then(setItems).catch((e) => { setError(errorMessage(e)); setItems([]); });
  }, []);

  if (items === null) return <Loading />;

  // Thay đổi so với lần trước cùng dạng phỏng vấn (danh sách server trả cũ → mới)
  const previous = new Map<string, number>();
  const rows = items.map((it) => {
    const prev = previous.get(it.interviewType);
    previous.set(it.interviewType, Number(it.overall));
    return { ...it, delta: prev === undefined ? null : Number(it.overall) - prev };
  }).reverse();

  return (
    <>
      <PageHeader title="Phỏng vấn thử"
        description="Luyện phỏng vấn với mentor có kinh nghiệm tuyển dụng; mỗi buổi có phiếu chấm 4 tiêu chí và 3 điểm cần cải thiện."
        actions={<ButtonLink href="/matching" variant="primary" icon={Mic}>Tìm mentor phỏng vấn thử</ButtonLink>} />
      <Alert>{error}</Alert>
      {rows.length === 0 ? (
        <EmptyState icon={Mic} title="Chưa có buổi phỏng vấn thử nào">
          Khi đặt lịch với mentor, chọn loại phiên &ldquo;Phỏng vấn thử&rdquo;. Kết quả từng buổi sẽ hiện ở đây để bạn theo dõi tiến bộ.
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Buổi</th>
                <th>Dạng</th>
                <th className="text-right">Kỹ thuật</th>
                <th className="text-right">Giải quyết</th>
                <th className="text-right">Chiều sâu</th>
                <th className="text-right">Giao tiếp</th>
                <th className="text-right">Tổng /10</th>
                <th>Kết luận</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId}>
                  <td>
                    <Link href={`/mentoring/sessions/${r.sessionId}/mock`} className="tabular">{formatDate(r.scheduledAt)}</Link>
                    <div className="text-small text-ink-muted">{r.mentorName ?? "Mentor"}</div>
                  </td>
                  <td className="whitespace-nowrap">{MOCK_TYPE_LABELS[r.interviewType]}</td>
                  <td className="text-right font-mono tabular">{r.technical}</td>
                  <td className="text-right font-mono tabular">{r.problemSolving}</td>
                  <td className="text-right font-mono tabular">{r.depth}</td>
                  <td className="text-right font-mono tabular">{r.communication}</td>
                  <td className="whitespace-nowrap text-right font-mono tabular">
                    {Number(r.overall).toFixed(2)}
                    {r.delta !== null && r.delta !== 0 && (
                      <span className={r.delta > 0 ? "text-success" : "text-danger"} title="So với lần trước cùng dạng">
                        {" "}{r.delta > 0 ? "▲" : "▼"}{Math.abs(r.delta).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap"><Badge tone={MOCK_VERDICT_TONE[r.verdict]}>{MOCK_VERDICT_LABELS[r.verdict]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

export default function MockHistoryPage() {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <MockHistory />
    </RequireAuth>
  );
}
