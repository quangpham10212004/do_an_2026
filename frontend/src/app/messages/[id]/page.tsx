"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Flag, Send } from "lucide-react";
import { Alert, Avatar, Button, ButtonLink, Card, FlashAlerts, Loading, PageHeader, Select, Textarea } from "@/components/ui";
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
    <div className="well flex w-full max-w-[420px] flex-col gap-2 self-start">
      <div className="text-small font-semibold">Báo cáo tin nhắn</div>
      <Alert>{error}</Alert>
      <Select aria-label="Lý do báo cáo" value={reason} onChange={(e) => setReason(e.target.value as MessageReportReason | "")}>
        <option value="">Chọn lý do</option>
        {MESSAGE_REPORT_REASONS.map((r) => <option key={r} value={r}>{MESSAGE_REPORT_REASON_LABELS[r]}</option>)}
      </Select>
      <Textarea aria-label="Mô tả thêm" className="min-h-[64px]" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Mô tả thêm (không bắt buộc)" />
      <div className="form-actions">
        <Button size="sm" variant="danger" disabled={!reason} loading={busy} onClick={async () => {
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
        }}>Gửi báo cáo</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Huỷ</Button>
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

  const name = c.counterpartName || "Người dùng";
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <PageHeader
        back={{ href: "/messages", label: "Tin nhắn" }}
        title={<span className="inline-flex items-center gap-3"><Avatar name={name} />{name}</span>}
        description={<span className="inline-flex flex-wrap items-center gap-2">{c.counterpartRole === "MENTOR" ? "Mentor" : "Mentee"} · Yêu cầu mentoring <MentoringStatusBadge status={c.requestStatus} /></span>}
        actions={<ButtonLink href="/mentoring/requests" size="sm">Xem yêu cầu</ButtonLink>}
      />
      <FlashAlerts flash={{ ok, error }} />
      {view.contactsMasked && (
        <Alert tone="info">
          Số điện thoại và email được ẩn cho tới khi có phiên trả phí đầu tiên được xác nhận. Giữ giao dịch trên MentorHub để được bảo vệ khi có sự cố.
        </Alert>
      )}
      <Card>
        <div className="chat max-h-[60vh] overflow-y-auto p-5 max-sm:p-4">
          {messages.length === 0 && <div className="bubble-system bubble">Chưa có tin nhắn. Hãy mở đầu cuộc trò chuyện.</div>}
          {messages.map((m) => (
            <div key={m.id} className="group flex flex-col gap-1">
              <div className={`bubble ${m.mine ? "bubble-me" : ""}`}>{m.body}</div>
              <div className={`bubble-meta flex items-center gap-2 ${m.mine ? "bubble-meta-me" : ""}`}>
                {m.mine ? "Bạn" : name} · {formatDateTime(m.createdAt)}
                {!m.mine && reporting !== m.id && (
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-ink-subtle hover:text-danger"
                    onClick={() => { setOk(""); setReporting(m.id); }}>
                    <Flag aria-hidden="true" className="size-3" />Báo cáo
                  </button>
                )}
              </div>
              {reporting === m.id && (
                <ReportForm messageId={m.id} onCancel={() => setReporting(null)}
                  onDone={(msg) => { setReporting(null); setOk(msg); }} />
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <div className="card-foot flex-col items-stretch">
          {!c.writable ? (
            <div className="text-small text-ink-muted">Cuộc trò chuyện đã đóng{view.readOnlyAt ? ` từ ${formatDateTime(view.readOnlyAt)}` : ""}, chỉ còn để xem.</div>
          ) : (
            <>
              {remaining !== null && (
                <div className="text-small text-ink-muted">Trước khi mentor chấp nhận, bạn còn gửi được <strong className="text-ink tabular">{remaining}</strong> tin nhắn.</div>
              )}
              {view.readOnlyAt && (
                <div className="text-small text-ink-muted">Yêu cầu đã đóng; cuộc trò chuyện chuyển sang chỉ xem lúc {formatDateTime(view.readOnlyAt)}.</div>
              )}
              <div className="flex items-end gap-2">
                <Textarea value={draft} maxLength={MESSAGE_MAX} disabled={blocked} rows={2} aria-label="Tin nhắn" className="min-h-[44px]"
                  placeholder={blocked ? "Bạn đã dùng hết lượt nhắn trước khi được chấp nhận" : "Nhập tin nhắn…"}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                  }} />
                <Button variant="primary" iconOnly icon={Send} label="Gửi" loading={sending} disabled={blocked || !draft.trim()} onClick={send} />
              </div>
              <span className="text-small text-ink-subtle tabular">{draft.length}/{MESSAGE_MAX} · Ctrl/⌘ + Enter để gửi</span>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function ThreadPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Thread id={params.id} />}</RequireAuth>;
}
