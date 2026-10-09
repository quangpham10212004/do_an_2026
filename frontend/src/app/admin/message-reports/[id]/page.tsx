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
import type { MessageReport, MessageReportOutcome } from "@/types";

/** US-33 (PRD-MSG-4) — chi tiết hồ sơ kiểm duyệt: xem cuộc trò chuyện (khi còn mở) và kết luận. */
function ReportDetail({ id }: { id: string }) {
  const [report, setReport] = useState<MessageReport | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mentoringApi.adminMessageReport(id).then(setReport).catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (!report) return error ? <Alert>{error}</Alert> : <Loading />;

  const resolve = async (outcome: MessageReportOutcome) => {
    setBusy(true);
    setError("");
    try {
      setReport(await mentoringApi.resolveMessageReport(id, outcome, note.trim() || undefined));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Hồ sơ kiểm duyệt tin nhắn" subtitle={<>Mở lúc {formatDateTime(report.createdAt)} <MentoringStatusBadge status={report.status} /></>}>
        <Link className="btn secondary sm" href="/admin/message-reports">← Danh sách</Link>
      </PageHead>
      <Alert>{error}</Alert>
      <div className="card stack">
        <div><strong>Lý do:</strong> {MESSAGE_REPORT_REASON_LABELS[report.reason]}</div>
        <div className="small"><strong>Người báo cáo:</strong> {report.reporterName || report.reporterId}</div>
        {report.note && <div className="small" style={{ whiteSpace: "pre-wrap" }}><strong>Mô tả:</strong> {report.note}</div>}
        {report.reportedMessage && (
          <div className="bubble bot">
            <div className="meta">{report.senderName || "Người gửi"} · {formatDateTime(report.reportedMessage.createdAt)}</div>
            {report.reportedMessage.body}
          </div>
        )}
      </div>
      {report.thread ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Toàn bộ cuộc trò chuyện</h3>
          <div className="chat" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {report.thread.map((m) => (
              <div key={m.id} className={`bubble ${m.id === report.reportedMessage?.id ? "me" : "bot"}`}>
                <div className="meta">{m.senderRole === "MENTOR" ? "Mentor" : "Mentee"} · {formatDateTime(m.createdAt)}</div>
                {m.body}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Alert type="info">Hồ sơ đã đóng — nội dung cuộc trò chuyện không còn hiển thị cho người kiểm duyệt.</Alert>
      )}
      {report.status === "OPEN" ? (
        <div className="card stack" style={{ marginTop: 12 }}>
          <h3>Kết luận</h3>
          <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (gửi kèm cảnh cáo cho người gửi nếu chọn Cảnh cáo)" />
          <div className="row">
            <button className="btn danger sm" disabled={busy} onClick={() => resolve("WARNED")}>Cảnh cáo người gửi</button>
            <button className="btn secondary sm" disabled={busy} onClick={() => resolve("DISMISSED")}>Không vi phạm</button>
          </div>
        </div>
      ) : (
        <div className="card stack" style={{ marginTop: 12 }}>
          <div><strong>Kết luận:</strong> {report.outcome ? MESSAGE_REPORT_OUTCOME_LABELS[report.outcome] : "—"} · {formatDateTime(report.resolvedAt)}</div>
          {report.resolutionNote && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{report.resolutionNote}</div>}
        </div>
      )}
    </>
  );
}

export default function AdminMessageReportPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["ADMIN"]}>{() => <ReportDetail id={params.id} />}</RequireAuth>;
}
