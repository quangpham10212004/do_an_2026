"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, type Flash } from "@/components/ui";
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
        if (!note.trim()) return setError("Vui lòng nhập ghi chú kết luận.");
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
        <h2 id="resolve-title">Kết luận tranh chấp</h2>
        <Alert>{error}</Alert>
        <div className="field">
          <label htmlFor="resolve-outcome">Kết luận</label>
          <select id="resolve-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as DisputeOutcome)}>
            {DISPUTE_OUTCOMES.map((o) => <option key={o} value={o}>{DISPUTE_OUTCOME_LABELS[o]}</option>)}
          </select>
        </div>
        {outcome === "PARTIAL_REFUND" && (
          <div className="field">
            <label htmlFor="resolve-percent">Phần trăm hoàn cho mentee (1–99)</label>
            <input id="resolve-percent" type="number" min={1} max={99} value={percent}
              onChange={(e) => setPercent(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          </div>
        )}
        {price > 0 && (
          <p className="small muted">
            Mentee được hoàn {refundPct}% ({formatMoney(Math.round((price * refundPct) / 100))}).
            {refundPct < 100 ? " Phần thu nhập còn lại của mentor được giải phóng ngay." : " Mentor không nhận thu nhập từ phiên này."}
            {outcome === "SUSPEND" && " Mentor bị chuyển SUSPENDED, các phiên sắp tới bị huỷ và hoàn 100%."}
          </p>
        )}
        <div className="field">
          <label htmlFor="resolve-note">Ghi chú (gửi cho hai bên)</label>
          <textarea id="resolve-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row dialog-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Huỷ</button>
          <button className={`btn ${outcome === "SUSPEND" ? "danger" : ""}`} disabled={busy}>Kết luận</button>
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
      <PageHead title={`Tranh chấp: ${DISPUTE_TYPE_LABELS[d.type]}`} subtitle={`Mở lúc ${formatDateTime(d.createdAt)} bởi ${d.openedByName || "—"}`}>
        <Link href="/admin/disputes" className="btn secondary sm">← Danh sách</Link>
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      {resolving && (
        <ResolveDialog dispute={d} onClose={() => setResolving(false)}
          onResolved={(x) => { setResolving(false); setD(x); setMsg({ ok: "Đã kết luận tranh chấp và thông báo cho hai bên." }); }} />
      )}
      <div className="grid grid-2">
        <div className="card">
          <div className="row between">
            <strong>Nội dung</strong>
            <MentoringStatusBadge status={d.status} />
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{d.description}</p>
          {d.evidenceLinks.length > 0 && (
            <div className="small">
              <strong>Bằng chứng:</strong>
              {d.evidenceLinks.map((l) => <div key={l}><a href={l} target="_blank" rel="noreferrer noopener">{l}</a></div>)}
            </div>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>
            Hạn phản hồi đầu tiên: {formatDateTime(d.firstResponseDueAt)} {d.overdue && <span className="badge bad">Quá hạn</span>}
            {d.firstResponseAt && <> · Đã phản hồi lúc {formatDateTime(d.firstResponseAt)}</>}
          </div>
          {d.status === "RESOLVED" ? (
            <div className="alert info" style={{ marginTop: 8 }}>
              <strong>Kết luận: {d.outcome && DISPUTE_OUTCOME_LABELS[d.outcome]}</strong>
              {d.outcome === "PARTIAL_REFUND" && ` (${d.refundPercent}%)`} · {formatDateTime(d.resolvedAt)}
              <div style={{ whiteSpace: "pre-wrap" }}>{d.resolutionNote}</div>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              {d.status === "OPEN" && (
                <button className="btn secondary sm" onClick={async () => {
                  try {
                    setD(await mentoringApi.startDisputeReview(d.id));
                    setMsg({ ok: "Đã chuyển sang Đang xem xét." });
                  } catch (e) {
                    setMsg({ error: errorMessage(e) });
                  }
                }}>Bắt đầu xem xét</button>
              )}
              <button className="btn sm" onClick={() => setResolving(true)}>Kết luận</button>
            </div>
          )}
        </div>
        {s && (
          <div className="card">
            <div className="row between">
              <strong>Phiên mentoring</strong>
              <MentoringStatusBadge status={s.status} labels={SESSION_STATUS_LABELS} />
            </div>
            <div className="small">Mentee: <Link href={`/admin/users`}>{s.menteeName}</Link></div>
            <div className="small">Mentor: <Link href={`/mentors/${s.mentorId}`}>{s.mentorName}</Link></div>
            <div className="small">{formatDateTime(s.scheduledAt)} – {formatDateTime(s.endsAt)} · {formatMoney(s.price)}</div>
            <div className="small">Mentee xác nhận: {s.menteeAttendance ? ATTENDANCE_LABELS[s.menteeAttendance] : "—"}</div>
            <div className="small">Mentor xác nhận: {s.mentorAttendance ? ATTENDANCE_LABELS[s.mentorAttendance] : "—"}</div>
            {s.refundPercent !== null && Number(s.price) > 0 && <div className="small">Đã hoàn: {s.refundPercent}%</div>}
            <div className="small muted">Mã phiên {s.id}</div>
          </div>
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
