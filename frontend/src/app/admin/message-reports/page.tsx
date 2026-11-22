"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { ArrowLeft, Flag } from "lucide-react";
import { Alert, Button, EmptyState, Field, FlashAlerts, Loading, PageHeader, Tabs, Textarea, type Flash } from "@/components/ui";
import { MESSAGE_REPORT_REASON_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import {
  getMessageReport, listContactViolations, listMessageReports, MOD_ACTION_LABELS, REPORT_REASON_TONE, resolveMessageReport,
  type ModAction, type ReportRow,
} from "@/features/modx/api";
import ModSubnav from "@/features/modx/ModSubnav";
import { errorMessage } from "@/lib/api";
import { formatDateTime, getDisplayTimeZone } from "@/lib/format";

type Tab = "open" | "done";

const ACTIONS: { id: ModAction; title: string; hint?: string }[] = [
  { id: "DISMISSED", title: "Bỏ qua", hint: "Báo cáo không có cơ sở" },
  { id: "WARNED", title: "Cảnh báo người bị báo", hint: "Gửi thông báo chính thức, ghi vào hồ sơ vi phạm" },
  { id: "RESTRICTED_7D", title: "Hạn chế nhắn tin 7 ngày", hint: "Người bị báo không gửi được tin nhắn mới trong 7 ngày" },
  { id: "SUSPENDED", title: "Đình chỉ tài khoản", hint: "Khoá tài khoản người bị báo cho tới khi quản trị viên mở lại" },
];

const roleName = (r: "MENTEE" | "MENTOR" | null) => (r === "MENTOR" ? "mentor" : r === "MENTEE" ? "mentee" : "người dùng");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: getDisplayTimeZone() });

function ago(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "vừa xong";
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hôm qua" : `${d} ngày trước`;
}

function ReportDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [r, setR] = useState<ReportRow | null>(null);
  const [choice, setChoice] = useState<ModAction>("WARNED");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getMessageReport(id).then(setR).catch((e) => setMsg({ error: errorMessage(e) })), [id]);
  useEffect(() => {
    setR(null);
    setMsg({});
    load();
  }, [load]);

  if (!r) return msg.error ? <Alert>{msg.error}</Alert> : <Loading />;
  const open = r.status === "OPEN";
  const heavy = choice === "RESTRICTED_7D" || choice === "SUSPENDED";

  async function submit() {
    if (!r) return;
    if (heavy && !note.trim()) return setMsg({ error: "Nhập ghi chú nội bộ để lưu lý do áp dụng chế tài." });
    setBusy(true);
    setMsg({});
    try {
      await resolveMessageReport(r, choice, note.trim() || undefined);
      setMsg({ ok: "Đã xử lý báo cáo." });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-md-detail">
      <Button className="adm-md-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>Danh sách báo cáo</Button>
      <FlashAlerts flash={msg} />
      <div className="adm-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h2">{r.code} · {MESSAGE_REPORT_REASON_LABELS[r.reason]}</h2>
            <div className="mt-1 text-small text-ink-muted">
              Người báo: {r.reporterName || "—"} ({roleName(r.reporterRole)}) · Bị báo: {r.senderName || "—"} ({roleName(r.senderRole)}) · {formatDateTime(r.createdAt)}
            </div>
            {r.note && <p className="mt-2 whitespace-pre-wrap text-small">Mô tả của người báo: {r.note}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 text-small text-ink-muted">
            <MentoringStatusBadge status={r.status} />
            <span>Đã có <b className={r.priorReports > 0 ? "text-warning" : "text-ink"}>{r.priorReports} báo cáo</b> trước đó với người này</span>
          </div>
        </div>
      </div>

      <div className="adm-panel">
        <h3 className="text-h3">Cuộc trò chuyện liên quan</h3>
        {r.thread ? (
          <div className="adm-thread mt-3" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {r.thread.map((m) => {
              const hit = m.id === r.reportedMessage?.id;
              const reporterIsMentee = r.reporterRole === "MENTEE";
              const mine = (m.senderRole === "MENTEE") === reporterIsMentee;
              const who = m.senderRole === "MENTOR" ? "Mentor" : "Mentee";
              return (
                <div key={m.id} className={`m ${mine && r.reporterRole ? "me" : ""} ${hit ? "hit" : ""}`}>
                  <div className="meta">{who} · {hm(m.createdAt)}{hit ? " · tin nhắn bị báo cáo" : ""}</div>
                  {m.body}
                </div>
              );
            })}
          </div>
        ) : r.reportedMessage ? (
          <>
            <div className="adm-thread mt-3"><div className="m hit"><div className="meta">{r.senderName || "Người gửi"} · {hm(r.reportedMessage.createdAt)} · tin nhắn bị báo cáo</div>{r.reportedMessage.body}</div></div>
            <p className="mt-2 text-small text-ink-muted">Hồ sơ đã đóng, phần còn lại của cuộc trò chuyện không còn hiển thị cho người kiểm duyệt.</p>
          </>
        ) : <p className="mt-2 text-small text-ink-muted">Không còn nội dung để hiển thị.</p>}
      </div>

      {open ? (
        <div className="adm-panel adm-decide">
          <h3 className="text-h3">Xử lý</h3>
          <div className="mt-3 flex flex-col gap-4">
            <div className="adm-opts" role="radiogroup" aria-label="Hành động">
              {ACTIONS.map((a) => (
                <label key={a.id} className="adm-opt">
                  <input type="radio" name="mr" checked={choice === a.id} onChange={() => setChoice(a.id)} />
                  <span><b>{a.title}</b>{a.hint && <small>{a.hint}</small>}</span>
                </label>
              ))}
            </div>
            <Field label="Ghi chú nội bộ" id="report-note" hint="Gửi kèm cho người bị báo nếu chọn Cảnh báo." required={heavy}>
              <Textarea id="report-note" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button variant={choice === "SUSPENDED" ? "danger" : "primary"} loading={busy} onClick={submit}>Xác nhận xử lý</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="adm-panel">
          <h3 className="text-h3">Kết luận</h3>
          <p className="mt-2"><strong>{r.sanction ? MOD_ACTION_LABELS[r.sanction] : r.outcome ? MOD_ACTION_LABELS[r.outcome] : "—"}</strong> <span className="text-ink-muted">· {formatDateTime(r.resolvedAt)}</span></p>
          {r.resolutionNote && <p className="mt-1 whitespace-pre-wrap text-ink-muted">{r.resolutionNote}</p>}
        </div>
      )}
    </div>
  );
}

/** US-33 (PRD-MSG-4) — hàng đợi kiểm duyệt tin nhắn bị báo cáo: danh sách trái, hồ sơ phải. */
function Reports() {
  const router = useRouter();
  const params = useSearchParams();
  const [all, setAll] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("open");
  const [sel, setSel] = useState<string | null>(params.get("id"));
  const [violations, setViolations] = useState<number | undefined>();

  const reload = useCallback(() => {
    listMessageReports().then((r) => { setAll(r.items); setError(r.error ?? ""); });
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => {
    listContactViolations(30).then((r) => setViolations(r.items.length)).catch(() => undefined);
  }, []);

  const open = useMemo(() => (all ?? []).filter((r) => r.status === "OPEN"), [all]);
  const done = useMemo(() => (all ?? []).filter((r) => r.status !== "OPEN"), [all]);
  const shown = tab === "open" ? open : done;

  useEffect(() => {
    if (!all) return;
    const cur = sel ? all.find((r) => r.id === sel) : undefined;
    if (cur) setTab(cur.status === "OPEN" ? "open" : "done");
    else if (!sel && window.matchMedia("(min-width: 901px)").matches && open[0]) setSel(open[0].id);
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string | null) => {
    setSel(id);
    router.replace(id ? `/admin/message-reports?id=${id}` : "/admin/message-reports", { scroll: false });
  };

  return (
    <>
      <PageHeader title="Kiểm duyệt tin nhắn" description="Báo cáo từ người dùng và tin nhắn bị hệ thống ghi nhận chứa thông tin liên hệ. Nội dung cuộc trò chuyện chỉ xem được khi hồ sơ còn mở." />
      <ModSubnav active="reports" reports={open.length} violations={violations} />
      <Alert className="mb-4">{error}</Alert>
      <Tabs className="mb-4" value={tab} onChange={setTab}
        tabs={[{ id: "open", label: "Cần xử lý", count: open.length }, { id: "done", label: "Đã xử lý", count: done.length }]} />
      {!all ? <Loading /> : (
        <div className={`adm-md ${sel ? "sel" : ""}`}>
          <section className="adm-md-list" aria-label="Danh sách báo cáo">
            {shown.length === 0 ? <EmptyState icon={Flag} title="Không có báo cáo nào" /> : shown.map((r) => (
              <button key={r.id} type="button" className={`adm-md-item ${r.status === "OPEN" && REPORT_REASON_TONE[r.reason] === "danger" ? "urgent" : ""}`} aria-current={r.id === sel} onClick={() => choose(r.id)}>
                <span className="top">
                  <span>{r.code}</span>
                  <span className={`adm-pill ${REPORT_REASON_TONE[r.reason] === "neutral" ? "" : REPORT_REASON_TONE[r.reason]}`}>{MESSAGE_REPORT_REASON_LABELS[r.reason]}</span>
                </span>
                <span className="sub block">{cap(roleName(r.reporterRole))} báo cáo {roleName(r.senderRole)} · {ago(r.createdAt)}</span>
              </button>
            ))}
          </section>
          {sel ? <ReportDetail key={sel} id={sel} onBack={() => choose(null)} onChanged={reload} /> : (
            <div className="adm-md-detail"><EmptyState icon={Flag} title="Chọn một báo cáo để xem chi tiết" /></div>
          )}
        </div>
      )}
    </>
  );
}

export default function AdminMessageReportsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Suspense fallback={<Loading />}><Reports /></Suspense>}</RequireAuth>;
}
