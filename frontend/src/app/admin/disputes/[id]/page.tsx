"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, DescriptionList, Field, FlashAlerts, Input, Loading, PageHeader, Select, Textarea, type Flash } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import {
  ATTENDANCE_LABELS,
  DISPUTE_OUTCOME_LABELS,
  DISPUTE_OUTCOMES,
  DISPUTE_TYPE_LABELS,
  SESSION_STATUS_LABELS,
} from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Dispute, DisputeOutcome } from "@/types";

/** Hộp thoại kết luận tranh chấp: kết luận, % hoàn (chỉ hoàn một phần), ghi chú bắt buộc. */
function ResolveDialog({ dispute, onClose, onResolved }: {
  dispute: Dispute;
  onClose: () => void;
  onResolved: (d: Dispute) => void;
}) {
  const [outcome, setOutcome] = useState<DisputeOutcome>("PARTIAL_REFUND");
  const [percent, setPercent] = useState(50);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const price = Number(dispute.session?.price || 0);
  const refundPct = outcome === "PARTIAL_REFUND" ? percent : outcome === "FULL_REFUND" || outcome === "SUSPEND" ? 100 : 0;

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="resolve-title" onSubmit={async (e) => {
        e.preventDefault();
        if (!note.trim()) return setError("Nhập ghi chú kết luận gửi cho hai bên.");
        setBusy(true);
        setError("");
        try {
          onResolved(await mentoringApi.resolveDispute(dispute.id, {
            outcome, note: note.trim(), ...(outcome === "PARTIAL_REFUND" ? { refundPercent: percent } : {}),
          }));
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}>
        <div className="dialog-body">
          <h2 id="resolve-title" className="dialog-title">Kết luận tranh chấp</h2>
          <Alert>{error}</Alert>
          <Field label="Kết luận" id="resolve-outcome">
            <Select id="resolve-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as DisputeOutcome)}>
              {DISPUTE_OUTCOMES.map((o) => <option key={o} value={o}>{DISPUTE_OUTCOME_LABELS[o]}</option>)}
            </Select>
          </Field>
          {outcome === "PARTIAL_REFUND" && (
            <Field label="Phần trăm hoàn cho mentee (1–99)" id="resolve-percent">
              <Input id="resolve-percent" type="number" min={1} max={99} value={percent}
                onChange={(e) => setPercent(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
            </Field>
          )}
          {price > 0 && (
            <div className="well text-small">
              Mentee được hoàn <strong>{refundPct}% ({formatMoney(Math.round((price * refundPct) / 100))})</strong>.
              {refundPct < 100 ? " Phần thu nhập còn lại của mentor được giải phóng ngay." : " Mentor không nhận thu nhập từ phiên này."}
              {outcome === "SUSPEND" && " Mentor bị tạm ngưng, các phiên sắp tới bị huỷ và hoàn 100%."}
            </div>
          )}
          <Field label="Ghi chú gửi cho hai bên" id="resolve-note" required>
            <Textarea id="resolve-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant={outcome === "SUSPEND" ? "danger" : "primary"} loading={busy}>Kết luận</Button>
        </div>
      </form>
    </div>
  );
}

/** US-32 — chi tiết tranh chấp, bắt đầu xem xét, kết luận. */
function DisputeDetail({ id }: { id: string }) {
  const [d, setD] = useState<Dispute | null>(null);
  const [msg, setMsg] = useState<Flash>({});
  const [resolving, setResolving] = useState(false);
  const load = useCallback(() => mentoringApi.adminDispute(id).then(setD).catch((e) => setMsg({ error: errorMessage(e) })), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!d) return msg.error ? <Alert>{msg.error}</Alert> : <Loading />;
  const s = d.session;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/disputes", label: "Tranh chấp" }}
        title={`Tranh chấp: ${DISPUTE_TYPE_LABELS[d.type]}`}
        description={`Mở lúc ${formatDateTime(d.createdAt)} bởi ${d.openedByName || "—"}`}
        actions={<MentoringStatusBadge status={d.status} />}
      />
      <FlashAlerts flash={msg} className="mb-6" />
      {resolving && (
        <ResolveDialog dispute={d} onClose={() => setResolving(false)}
          onResolved={(x) => { setResolving(false); setD(x); setMsg({ ok: "Đã kết luận tranh chấp và thông báo cho hai bên." }); }} />
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Nội dung báo cáo"
            description={<span className="inline-flex flex-wrap items-center gap-2">
              Hạn phản hồi đầu tiên {formatDateTime(d.firstResponseDueAt)}
              {d.overdue && <Badge tone="danger">Quá hạn</Badge>}
              {d.firstResponseAt && <>· đã phản hồi lúc {formatDateTime(d.firstResponseAt)}</>}
            </span>} />
          <CardBody className="flex flex-col gap-4">
            <p className="prose whitespace-pre-wrap">{d.description}</p>
            {d.evidenceLinks.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Bằng chứng</div>
                <ul className="flex flex-col gap-1">
                  {d.evidenceLinks.map((l) => <li key={l} className="truncate"><a href={l} target="_blank" rel="noreferrer noopener">{l}</a></li>)}
                </ul>
              </div>
            )}
            {d.status === "RESOLVED" && (
              <Alert tone="info" title={<>Kết luận: {d.outcome && DISPUTE_OUTCOME_LABELS[d.outcome]}{d.outcome === "PARTIAL_REFUND" && ` (${d.refundPercent}%)`} · {formatDateTime(d.resolvedAt)}</>}>
                <div className="whitespace-pre-wrap">{d.resolutionNote}</div>
              </Alert>
            )}
          </CardBody>
          {d.status !== "RESOLVED" && (
            <CardFooter>
              {d.status === "OPEN" && (
                <Button onClick={async () => {
                  try {
                    setD(await mentoringApi.startDisputeReview(d.id));
                    setMsg({ ok: "Đã chuyển sang Đang xem xét." });
                  } catch (e) {
                    setMsg({ error: errorMessage(e) });
                  }
                }}>Bắt đầu xem xét</Button>
              )}
              <Button variant="primary" onClick={() => setResolving(true)}>Kết luận</Button>
            </CardFooter>
          )}
        </Card>
        {s && (
          <Card>
            <CardHeader title="Phiên mentoring" actions={<MentoringStatusBadge status={s.status} labels={SESSION_STATUS_LABELS} />} />
            <CardBody>
              <DescriptionList items={[
                ["Mentee", <Link key="me" href="/admin/users">{s.menteeName}</Link>],
                ["Mentor", <Link key="mt" href={`/mentors/${s.mentorId}`}>{s.mentorName}</Link>],
                ["Thời gian", `${formatDateTime(s.scheduledAt)} – ${formatDateTime(s.endsAt)}`],
                ["Giá", formatMoney(s.price)],
                ["Mentee xác nhận", s.menteeAttendance ? ATTENDANCE_LABELS[s.menteeAttendance] : "—"],
                ["Mentor xác nhận", s.mentorAttendance ? ATTENDANCE_LABELS[s.mentorAttendance] : "—"],
                ...(s.refundPercent !== null && Number(s.price) > 0 ? [["Đã hoàn", `${s.refundPercent}%`] as [string, string]] : []),
                ["Mã phiên", <span key="id" className="font-mono text-small break-all">{s.id}</span>],
              ]} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function Page() {
  const params = useParams<{ id: string }>();
  return <DisputeDetail id={params.id} />;
}

export default function AdminDisputeDetailPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Page />}</RequireAuth>;
}
