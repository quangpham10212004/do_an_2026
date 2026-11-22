"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { ArrowLeft, Clock, Scale } from "lucide-react";
import { Alert, Button, EmptyState, Field, FlashAlerts, Loading, Modal, PageHeader, Select, Tabs, Textarea, type Flash } from "@/components/ui";
import { DISPUTE_TYPE_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import {
  disputeCode, getDispute, getDisputeExtra, listDisputes, requestDisputeEvidence, resolveDispute, startDisputeReview,
  type DisputeExtra, type Statement, type TimelineEvent,
} from "@/features/modx/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney, getDisplayTimeZone } from "@/lib/format";
import type { Dispute, DisputeOutcome } from "@/types";

type Tab = "open" | "done";

const OUTCOMES: { id: Extract<DisputeOutcome, "FULL_REFUND" | "PARTIAL_REFUND" | "NO_REFUND">; label: string }[] = [
  { id: "FULL_REFUND", label: "Hoàn 100% cho mentee" },
  { id: "PARTIAL_REFUND", label: "Hoàn một phần" },
  { id: "NO_REFUND", label: "Chuyển cho mentor" },
];
const OUTCOME_LABEL: Record<string, string> = {
  FULL_REFUND: "Hoàn 100% cho mentee", PARTIAL_REFUND: "Hoàn một phần", NO_REFUND: "Chuyển cho mentor",
  WARNING: "Cảnh cáo mentor (không hoàn)", SUSPEND: "Hoàn 100% và khoá mentor",
};

const hm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: getDisplayTimeZone() });
const dm = (iso: string | undefined) => (iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: getDisplayTimeZone() }) : "");

/** Thời hạn phản hồi đầu tiên (48 giờ): quá hạn / còn bao lâu; đã phản hồi hoặc đã xong thì ẩn. */
function sla(d: Dispute): { text: string; tone: "danger" | "warning" | "" } | null {
  if (d.status === "RESOLVED" || d.firstResponseAt) return null;
  if (d.overdue) return { text: "Quá hạn", tone: "danger" };
  const ms = new Date(d.firstResponseDueAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  const h = Math.max(1, Math.ceil(ms / 3600000));
  return { text: h >= 48 ? `Còn ${Math.round(h / 24)} ngày` : `Còn ${h} giờ`, tone: h <= 12 ? "danger" : "warning" };
}

function StatementCard({ title, s, asked }: { title: string; s: Statement; asked: boolean }) {
  return (
    <div className="adm-panel">
      <b className="text-small text-accent-ink">{title}</b>
      {s.text ? <p className="mt-2 text-small leading-relaxed">&ldquo;{s.text}&rdquo;</p> : <p className="mt-2 text-small text-ink-muted">Chưa có lời kể từ bên này.</p>}
      {asked && <p className="mt-2"><span className="adm-pill warning">Đã yêu cầu bổ sung bằng chứng</span></p>}
      <div className="mb-1 mt-3 text-small font-semibold text-ink-muted">Bằng chứng</div>
      {s.evidence.length ? (
        <div className="adm-chips" style={{ marginTop: 0 }}>
          {s.evidence.map((e) => e.href
            ? <a key={e.label} href={e.href} target="_blank" rel="noreferrer noopener">{e.label}</a>
            : <span key={e.label}>{e.label}</span>)}
        </div>
      ) : <p className="text-small text-ink-muted">Chưa có bằng chứng.</p>}
    </div>
  );
}

function Timeline({ events, note }: { events: TimelineEvent[]; note: string | null }) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="adm-panel">
      <h3 className="text-h3">Nhật ký hệ thống (khách quan)</h3>
      {sorted.length === 0 ? <p className="mt-3 text-small text-ink-muted">Chưa có sự kiện nào được ghi nhận.</p> : (
        <ol className="adm-tl compact mt-3">
          {sorted.map((e, i) => (
            <li key={i} className={e.flag ? "flag" : ""}>
              <time dateTime={e.at}>{hm(e.at)}</time>
              <span><b>{e.who}</b> {e.text}</span>
            </li>
          ))}
        </ol>
      )}
      {note && <div className="adm-callout mt-3">{note}</div>}
    </div>
  );
}

function EvidenceDialog({ dispute, onClose, onDone }: { dispute: Dispute; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState<"MENTEE" | "MENTOR" | "BOTH">("BOTH");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Yêu cầu thêm bằng chứng" onClose={onClose} width={480}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Huỷ</Button>
        <Button variant="primary" loading={busy} onClick={async () => {
          if (message.trim().length < 5) return setError("Nhập nội dung yêu cầu (ít nhất 5 ký tự).");
          setBusy(true);
          try {
            await requestDisputeEvidence(dispute, from, message.trim());
            onDone();
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}>Gửi yêu cầu</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Alert>{error}</Alert>
        <Field label="Gửi tới" id="ev-from">
          <Select id="ev-from" value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
            <option value="BOTH">Cả hai bên</option>
            <option value="MENTEE">Mentee</option>
            <option value="MENTOR">Mentor</option>
          </Select>
        </Field>
        <Field label="Bạn cần thêm gì?" id="ev-msg" required>
          <Textarea id="ev-msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DecisionCard({ dispute, extra, onResolved, onAskEvidence }: {
  dispute: Dispute; extra: DisputeExtra; onResolved: (d: Dispute) => void; onAskEvidence: () => void;
}) {
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["id"]>("FULL_REFUND");
  const [percent, setPercent] = useState(50);
  const [note, setNote] = useState("");
  const [reliability, setReliability] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const price = Number(dispute.session?.price || 0);
  const refundPct = outcome === "PARTIAL_REFUND" ? percent : outcome === "FULL_REFUND" ? 100 : 0;
  const atFault = outcome === "NO_REFUND" ? "mentee" : "mentor";
  const money = (pct: number) => formatMoney(Math.round((price * pct) / 100));
  const hint: Record<string, string> = {
    FULL_REFUND: `${money(100)} về ví mentee, mentor không nhận`,
    PARTIAL_REFUND: `Mentee nhận ${money(percent)}, mentor nhận ${money(100 - percent)}`,
    NO_REFUND: "Phiên coi như đã diễn ra, mentor nhận thu nhập",
  };

  return (
    <form className="adm-panel adm-decide" onSubmit={async (e) => {
      e.preventDefault();
      if (!note.trim()) return setError("Nhập ghi chú kết luận gửi cho hai bên.");
      setBusy(true);
      setError("");
      try {
        onResolved(await resolveDispute(dispute, {
          outcome, note: note.trim(), recordReliability: reliability, ...(outcome === "PARTIAL_REFUND" ? { refundPercent: percent } : {}),
        }));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    }}>
      <h3 className="text-h3">Quyết định</h3>
      <div className="mt-3 flex flex-col gap-4">
        <Alert>{error}</Alert>
        <div className="adm-opts" role="radiogroup" aria-label="Quyết định">
          {OUTCOMES.map((o) => (
            <label key={o.id} className="adm-opt">
              <input type="radio" name="outcome" checked={outcome === o.id} onChange={() => setOutcome(o.id)} />
              <span className="flex-1"><b>{o.label}</b><small>{hint[o.id]}</small></span>
              {o.id === "PARTIAL_REFUND" && outcome === o.id && (
                <span className="inline-flex items-center gap-1">
                  <input className="input adm-pct" aria-label="Phần trăm hoàn cho mentee (1–99)" type="number" min={1} max={99} value={percent}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPercent(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />%
                </span>
              )}
            </label>
          ))}
        </div>
        {price > 0 && <div className="well text-small">Mentee được hoàn <strong>{refundPct}% ({money(refundPct)})</strong>.{refundPct < 100 ? " Phần còn lại được giải phóng cho mentor." : ""}</div>}
        <Field label="Giải thích quyết định" hint="Gửi cho cả hai bên." id="resolve-note" required>
          <Textarea id="resolve-note" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="adm-checkrow">
          <input type="checkbox" checked={reliability} onChange={(e) => setReliability(e.target.checked)} />
          Ghi nhận vào độ tin cậy của {atFault} ({DISPUTE_TYPE_LABELS[dispute.type].toLowerCase()})
        </label>
        {extra.evidenceRequestedFrom.length > 0 && <p className="text-small text-ink-muted">Đã yêu cầu bổ sung bằng chứng từ {extra.evidenceRequestedFrom.map((p) => (p === "MENTEE" ? "mentee" : "mentor")).join(" và ")}.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={onAskEvidence}>Yêu cầu thêm bằng chứng</Button>
          <Button type="submit" variant="primary" loading={busy}>Xác nhận quyết định</Button>
        </div>
      </div>
    </form>
  );
}

function DisputeDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Dispute | null>(null);
  const [extra, setExtra] = useState<DisputeExtra | null>(null);
  const [msg, setMsg] = useState<Flash>({});
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const x = await getDispute(id);
      setD(x);
      setExtra(await getDisputeExtra(x));
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }, [id]);
  useEffect(() => {
    setD(null);
    setExtra(null);
    setMsg({});
    load();
  }, [load]);

  if (!d || !extra) return msg.error ? <Alert>{msg.error}</Alert> : <Loading />;
  const s = d.session;
  const resolved = d.status === "RESOLVED";

  return (
    <div className="adm-md-detail">
      <Button className="adm-md-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>Danh sách tranh chấp</Button>
      <FlashAlerts flash={msg} />
      {asking && <EvidenceDialog dispute={d} onClose={() => setAsking(false)}
        onDone={() => { setAsking(false); setMsg({ ok: "Đã gửi yêu cầu bổ sung bằng chứng." }); load(); }} />}

      <div className="adm-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h2">{extra.code} · {DISPUTE_TYPE_LABELS[d.type]}{s ? ` · ${formatDateTime(s.scheduledAt)}` : ""}</h2>
            {s && <div className="mt-1 text-small text-ink-muted">
              {s.menteeName} (mentee) với {s.mentorName} (mentor) · {formatMoney(s.price)}
              {extra.held > 0 && <> · <strong className="text-ink">{formatMoney(extra.held)} đang giữ</strong></>}
            </div>}
            <div className="mt-1 text-small text-ink-muted">Mở lúc {formatDateTime(d.createdAt)} bởi {d.openedByName || "hệ thống"}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {extra.mismatch && <span className="adm-pill danger">Hai bên không khớp</span>}
            <MentoringStatusBadge status={d.status} />
          </div>
        </div>
      </div>

      <div className="adm-two-col">
        <StatementCard title="Mentee nói" s={extra.mentee} asked={extra.evidenceRequestedFrom.includes("MENTEE")} />
        <StatementCard title="Mentor nói" s={extra.mentor} asked={extra.evidenceRequestedFrom.includes("MENTOR")} />
      </div>

      <Timeline events={extra.timeline} note={extra.timelineNote} />

      {resolved ? (
        <Alert tone="info" title={<>Kết luận: {d.outcome && (OUTCOME_LABEL[d.outcome] ?? d.outcome)}{d.outcome === "PARTIAL_REFUND" && d.refundPercent ? ` (${d.refundPercent}%)` : ""} · {formatDateTime(d.resolvedAt)}</>}>
          <div className="whitespace-pre-wrap">{d.resolutionNote}</div>
        </Alert>
      ) : (
        <>
          {d.status === "OPEN" && (
            <div className="flex justify-end">
              <Button onClick={async () => {
                try {
                  setD(await startDisputeReview(d));
                  setMsg({ ok: "Đã chuyển sang Đang xem xét." });
                  onChanged();
                } catch (e) {
                  setMsg({ error: errorMessage(e) });
                }
              }}>Bắt đầu xem xét</Button>
            </div>
          )}
          <DecisionCard dispute={d} extra={extra} onAskEvidence={() => setAsking(true)}
            onResolved={(x) => { setD(x); setMsg({ ok: "Đã kết luận tranh chấp và thông báo cho hai bên." }); onChanged(); }} />
        </>
      )}
    </div>
  );
}

/** US-32 — tranh chấp: danh sách trái, chi tiết phải. Route /admin/disputes/[id] chuyển về ?id=. */
function Disputes() {
  const router = useRouter();
  const params = useSearchParams();
  const [all, setAll] = useState<Dispute[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("open");
  const [sel, setSel] = useState<string | null>(params.get("id"));

  const reload = useCallback(() => {
    listDisputes().then((r) => { setAll(r.items); setError(r.error ?? ""); });
  }, []);
  useEffect(reload, [reload]);

  const open = useMemo(() => (all ?? []).filter((d) => d.status !== "RESOLVED"), [all]);
  const done = useMemo(() => (all ?? []).filter((d) => d.status === "RESOLVED"), [all]);
  const shown = tab === "open" ? open : done;
  const overdue = open.filter((d) => d.overdue).length;

  // Mở sẵn mục đầu tiên trên màn rộng; trên màn hẹp người dùng chọn.
  useEffect(() => {
    if (!all) return;
    if (sel && all.some((d) => d.id === sel)) {
      const d = all.find((x) => x.id === sel)!;
      setTab(d.status === "RESOLVED" ? "done" : "open");
    } else if (!sel && typeof window !== "undefined" && window.matchMedia("(min-width: 901px)").matches && open[0]) setSel(open[0].id);
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string | null) => {
    setSel(id);
    router.replace(id ? `/admin/disputes?id=${id}` : "/admin/disputes", { scroll: false });
  };

  return (
    <>
      <PageHeader title="Tranh chấp" description="Xem xét khiếu nại về phiên học và quyết định hoàn tiền hay chuyển cho mentor. Phản hồi đầu tiên trong 48 giờ." />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        <Alert>{error}</Alert>
        {overdue > 0 && <Alert tone="warning">{overdue} tranh chấp đã quá hạn phản hồi 48 giờ.</Alert>}
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab}
        tabs={[{ id: "open", label: "Đang mở", count: open.length }, { id: "done", label: "Đã xử lý", count: done.length }]} />
      {!all ? <Loading /> : (
        <div className={`adm-md ${sel ? "sel" : ""}`}>
          <section className="adm-md-list" aria-label="Danh sách tranh chấp">
            {shown.length === 0 ? <EmptyState icon={Scale} title="Không có tranh chấp nào" /> : shown.map((d) => {
              const w = sla(d);
              return (
                <button key={d.id} type="button" className={`adm-md-item ${d.overdue && d.status !== "RESOLVED" ? "urgent" : ""}`} aria-current={d.id === sel} onClick={() => choose(d.id)}>
                  <span className="top">
                    <span>{disputeCode(d.id)}{d.session ? ` · Phiên ${dm(d.session.scheduledAt)}` : ""}</span>
                    {w && <span className={`adm-pill ${w.tone}`}><Clock size={12} aria-hidden /> {w.text}</span>}
                  </span>
                  <span className="sub block">{d.openedByRole === "MENTOR" ? "Mentor" : d.openedByRole === "MENTEE" ? "Mentee" : "Hệ thống"}: {DISPUTE_TYPE_LABELS[d.type]}</span>
                  {d.session && <span className="sub block text-small">{d.status === "RESOLVED" ? (d.outcome ? OUTCOME_LABEL[d.outcome] : "") : `${formatMoney(d.session.price)} đang giữ`}</span>}
                </button>
              );
            })}
          </section>
          {sel ? <DisputeDetail key={sel} id={sel} onBack={() => choose(null)} onChanged={reload} /> : (
            <div className="adm-md-detail"><EmptyState icon={Scale} title="Chọn một tranh chấp để xem chi tiết" /></div>
          )}
        </div>
      )}
    </>
  );
}

export default function AdminDisputesPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Suspense fallback={<Loading />}><Disputes /></Suspense>}</RequireAuth>;
}
