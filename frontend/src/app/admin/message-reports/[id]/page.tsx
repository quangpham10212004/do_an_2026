"use client";

import { useEffect, useState, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, DescriptionList, Field, Loading, PageHeader, Textarea } from "@/components/ui";
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
      <PageHeader
        back={{ href: "/admin/message-reports", label: "Báo cáo tin nhắn" }}
        title="Hồ sơ kiểm duyệt tin nhắn"
        description={`Mở lúc ${formatDateTime(report.createdAt)}`}
        actions={<MentoringStatusBadge status={report.status} />}
      />
      <Alert className="mb-6">{error}</Alert>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Tin nhắn bị báo cáo" />
            <CardBody className="flex flex-col gap-4">
              <DescriptionList items={[
                ["Lý do", MESSAGE_REPORT_REASON_LABELS[report.reason]],
                ["Người báo cáo", report.reporterName || report.reporterId],
                ...(report.note ? [["Mô tả", <span key="n" className="whitespace-pre-wrap">{report.note}</span>] as [string, ReactNode]] : []),
              ]} />
              {report.reportedMessage && (
                <div className="chat">
                  <div className="bubble border border-danger">{report.reportedMessage.body}</div>
                  <div className="bubble-meta">{report.senderName || "Người gửi"} · {formatDateTime(report.reportedMessage.createdAt)}</div>
                </div>
              )}
            </CardBody>
          </Card>
          {report.thread ? (
            <Card>
              <CardHeader title="Toàn bộ cuộc trò chuyện" description="Tin nhắn bị báo cáo được viền đỏ." />
              <div className="chat max-h-[50vh] overflow-y-auto p-5">
                {report.thread.map((m) => (
                  <div key={m.id} className="flex flex-col gap-1">
                    <div className={`bubble ${m.senderRole === "MENTOR" ? "" : "bubble-me"} ${m.id === report.reportedMessage?.id ? "outline-2 outline-danger outline-offset-2" : ""}`}>{m.body}</div>
                    <div className={`bubble-meta ${m.senderRole === "MENTOR" ? "" : "bubble-meta-me"}`}>{m.senderRole === "MENTOR" ? "Mentor" : "Mentee"} · {formatDateTime(m.createdAt)}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Alert tone="info">Hồ sơ đã đóng, nội dung cuộc trò chuyện không còn hiển thị cho người kiểm duyệt.</Alert>
          )}
        </div>
        {report.status === "OPEN" ? (
          <Card>
            <CardHeader title="Kết luận" />
            <CardBody>
              <Field label="Ghi chú" id="report-note" hint="Gửi kèm cảnh cáo cho người gửi nếu chọn Cảnh cáo.">
                <Textarea id="report-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </CardBody>
            <CardFooter>
              <Button disabled={busy} onClick={() => resolve("DISMISSED")}>Không vi phạm</Button>
              <Button variant="danger" loading={busy} onClick={() => resolve("WARNED")}>Cảnh cáo người gửi</Button>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Kết luận" />
            <CardBody className="flex flex-col gap-2">
              <div><strong>{report.outcome ? MESSAGE_REPORT_OUTCOME_LABELS[report.outcome] : "—"}</strong> <span className="text-ink-muted">· {formatDateTime(report.resolvedAt)}</span></div>
              {report.resolutionNote && <p className="whitespace-pre-wrap text-ink-muted">{report.resolutionNote}</p>}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

export default function AdminMessageReportPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["ADMIN"]}>{() => <ReportDetail id={params.id} />}</RequireAuth>;
}
