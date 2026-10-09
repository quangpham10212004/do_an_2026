"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { MESSAGE_MAX, MESSAGE_REPORT_REASONS, MESSAGE_REPORT_REASON_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ChatMessage, ConversationView, MessageReportReason } from "@/types";

/** Gộp tin mới (polling) vào danh sách hiện có, bỏ trùng theo id, giữ thứ tự thời gian. */
function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  return added.length === 0 ? current : [...current, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** PRD-MSG-4 — báo cáo một tin nhắn của bên kia. */
function ReportForm({ messageId, onDone, onCancel }: { messageId: string; onDone: (msg: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<MessageReportReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack" style={{ boxShadow: "none", marginTop: 4, alignSelf: "flex-start", maxWidth: 420 }}>
      <strong className="small">Báo cáo tin nhắn</strong>
      <Alert>{error}</Alert>
      <select value={reason} onChange={(e) => setReason(e.target.value as MessageReportReason | "")}>
        <option value="">— Chọn lý do —</option>
        {MESSAGE_REPORT_REASONS.map((r) => <option key={r} value={r}>{MESSAGE_REPORT_REASON_LABELS[r]}</option>)}
      </select>
      <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Mô tả thêm (tuỳ chọn)" />
      <div className="row">
        <button className="btn danger sm" disabled={!reason || busy} onClick={async () => {
          if (!reason) return;
          setBusy(true);
          try {
            await mentoringApi.reportMessage(messageId, reason, note.trim() || undefined);
            onDone("Đã gửi báo cáo. Quản trị viên sẽ xem xét cuộc trò chuyện này.");
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>Gửi báo cáo</button>
        <button className="btn secondary sm" onClick={onCancel}>Thôi</button>
      </div>
    </div>
  );
}

/** US-33 — luồng tin nhắn, polling mỗi 10 giây (PRD-MSG-2). */
function Thread({ id }: { id: string }) {
  const [view, setView] = useState<ConversationView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const lastAt = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async (incremental: boolean) => {
    const res = await mentoringApi.conversation(id, incremental ? lastAt.current : undefined);
    setView(res);
    setMessages((cur) => {
      const next = incremental ? merge(cur, res.messages) : res.messages;
      lastAt.current = next.length ? next[next.length - 1].createdAt : lastAt.current;
      return next;
    });
  }, [id]);

  useEffect(() => {
    load(false).catch((e) => setError(errorMessage(e)));
  }, [load]);

  const interval = (view?.pollIntervalSeconds ?? 10) * 1000;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(true).catch(() => {});
    }, interval);
    return () => clearInterval(timer);
  }, [load, interval]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!view) return error ? <Alert>{error}</Alert> : <Loading />;
  const c = view.conversation;
  const remaining = view.remainingBeforeAccept;
  const blocked = !c.writable || remaining === 0;

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError("");
    try {
      const sent = await mentoringApi.sendMessage(id, body);
      setDraft("");
      setMessages((cur) => {
        const next = merge(cur, [sent]);
        lastAt.current = next[next.length - 1].createdAt;
        return next;
      });
      // Cập nhật số tin còn được gửi trước khi được chấp nhận.
      if (remaining !== null) load(true).catch(() => {});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHead
        title={<>{c.counterpartName || "Người dùng"} <span className="muted small">· {c.counterpartRole === "MENTOR" ? "mentor" : "mentee"}</span></>}
        subtitle={<>Yêu cầu mentoring <MentoringStatusBadge status={c.requestStatus} /></>}
      >
        <Link className="btn secondary sm" href="/messages">← Hộp thư</Link>
        <Link className="btn secondary sm" href="/mentoring/requests">Yêu cầu</Link>
      </PageHead>
      <Alert type="success">{ok}</Alert>
      <Alert>{error}</Alert>
      {view.contactsMasked && (
        <Alert type="info">
          Số điện thoại và email được ẩn cho tới khi có phiên trả phí đầu tiên được xác nhận — hãy giữ giao dịch trên MentorHub để được bảo vệ khi có sự cố.
        </Alert>
      )}
      <div className="card">
        <div className="chat" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {messages.length === 0 && <div className="muted small">Chưa có tin nhắn. Hãy mở đầu cuộc trò chuyện.</div>}
          {messages.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
              <div className={`bubble ${m.mine ? "me" : "bot"}`}>
                <div className="meta">{m.mine ? "Bạn" : c.counterpartName || "Người dùng"} · {formatDateTime(m.createdAt)}</div>
                {m.body}
              </div>
              {!m.mine && reporting !== m.id && (
                <button className="btn secondary sm" style={{ alignSelf: "flex-start", marginTop: 2 }}
                  onClick={() => { setOk(""); setReporting(m.id); }}>Báo cáo</button>
              )}
              {reporting === m.id && (
                <ReportForm messageId={m.id} onCancel={() => setReporting(null)}
                  onDone={(msg) => { setReporting(null); setOk(msg); }} />
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      </div>
      <div className="card stack" style={{ marginTop: 12 }}>
        {!c.writable ? (
          <div className="muted small">Cuộc trò chuyện đã đóng{view.readOnlyAt ? ` từ ${formatDateTime(view.readOnlyAt)}` : ""} — chỉ còn để xem.</div>
        ) : (
          <>
            {remaining !== null && (
              <div className="small muted">
                Trước khi mentor chấp nhận, bạn còn gửi được <strong>{remaining}</strong> tin nhắn.
              </div>
            )}
            {c.writable && view.readOnlyAt && (
              <div className="small muted">Yêu cầu đã đóng; cuộc trò chuyện chuyển sang chỉ xem lúc {formatDateTime(view.readOnlyAt)}.</div>
            )}
            <textarea value={draft} maxLength={MESSAGE_MAX} disabled={blocked} rows={3}
              placeholder={blocked ? "Bạn đã dùng hết lượt nhắn trước khi được chấp nhận" : "Nhập tin nhắn…"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
              }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="small muted">{draft.length}/{MESSAGE_MAX} · Ctrl/⌘ + Enter để gửi</span>
              <button className="btn sm" disabled={blocked || sending || !draft.trim()} onClick={send}>Gửi</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function ThreadPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Thread id={params.id} />}</RequireAuth>;
}
