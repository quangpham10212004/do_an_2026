"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Bell, BellOff, CalendarClock, FileText, Flag, Paperclip, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, FlashAlerts, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { authorHref } from "@/features/learning/AuthorAvatar";
import { mentoringApi } from "@/features/mentoring/api";
import { MESSAGE_MAX, MESSAGE_REPORT_REASONS, MESSAGE_REPORT_REASON_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { CONTACT_WARNING, detectContact, formatBytes, messageX, type Presence, type SharedFile, type UpcomingSession } from "@/features/socialx/api";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
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
  const [presence, setPresence] = useState<Presence | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingSession | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [muted, setMuted] = useState(false);
  const [flags, setFlags] = useState<Record<string, "phone" | "email">>({});
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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

  const counterpartId = view?.conversation.counterpartId;
  useEffect(() => {
    setFlags(messageX.flaggedMessages(id));
    messageX.sharedFiles(id).then(setFiles).catch(() => setFiles([]));
    messageX.getMuted(id).then(setMuted).catch(() => setMuted(false));
    messageX.upcomingSession(id).then(setUpcoming).catch(() => setUpcoming(null));
  }, [id]);
  useEffect(() => {
    if (!counterpartId) return;
    const refresh = () => messageX.presence(id, counterpartId).then(setPresence).catch(() => setPresence(null));
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [counterpartId]);

  const interval = (view?.pollIntervalSeconds ?? 10) * 1000;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(true).catch(() => {});
    }, interval);
    return () => clearInterval(timer);
  }, [load, interval]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, files.length]);

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
      const kind = detectContact(body);
      const sent = await mentoringApi.sendMessage(id, body);
      if (kind) {
        messageX.flagMessage(id, sent.id, kind);
        setFlags(messageX.flaggedMessages(id));
      }
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

  async function attach(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const f = await messageX.uploadAttachment(id, file);
      setFiles((cur) => [...cur, f]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      await messageX.setMuted(id, next);
      setOk(next ? "Đã tắt thông báo cho hội thoại này." : "Đã bật lại thông báo cho hội thoại này.");
    } catch (e) {
      setMuted(!next);
      setError(errorMessage(e));
    }
  }

  function downloadFile(event: React.MouseEvent<HTMLAnchorElement>, file: SharedFile) {
    event.preventDefault();
    messageX.downloadAttachment(file).catch((e) => setError(errorMessage(e)));
  }

  const draftContact = detectContact(draft);
  // Tin nhắn và tệp đính kèm xếp chung theo thời gian.
  type Item = { kind: "msg"; at: string; m: ChatMessage } | { kind: "file"; at: string; f: SharedFile };
  const timeline: Item[] = [
    ...messages.map((m): Item => ({ kind: "msg", at: m.createdAt, m })),
    ...files.map((f): Item => ({ kind: "file", at: f.createdAt, f })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const name = c.counterpartName || "Người dùng";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: "/messages", label: "Tin nhắn" }}
        title={<span className="inline-flex items-center gap-3"><Avatar name={name} />{name}</span>}
        description={<span className="inline-flex flex-wrap items-center gap-2">{c.counterpartRole === "MENTOR" ? "Mentor" : "Mentee"} · Yêu cầu mentoring <MentoringStatusBadge status={c.requestStatus} />
          {presence && <span className="sc-presence" data-online={presence.online}><span className="dot" aria-hidden="true" />{presence.online ? "Đang hoạt động" : "Ngoại tuyến"}</span>}
          {muted && <Badge plain>Đã tắt thông báo</Badge>}</span>}
        actions={<ButtonLink href="/mentoring/requests" size="sm">Xem yêu cầu</ButtonLink>}
      />
      <FlashAlerts flash={{ ok, error }} />
      {view.contactsMasked && (
        <Alert tone="info">
          Số điện thoại, email, đường dẫn ngoài và tài khoản mạng xã hội luôn được ẩn trong tin nhắn. Hãy học qua phòng học và
          thanh toán trên MentorHub để được bảo vệ khi có sự cố — chia sẻ liên hệ nhiều lần sẽ được báo cho quản trị viên.
        </Alert>
      )}
      {upcoming && (
        <div className="sc-upcoming">
          <CalendarClock aria-hidden="true" />
          <div className="grow"><b>Phiên sắp tới: {upcoming.title}</b><span>{formatDateTime(upcoming.startsAt)}</span></div>
          <ButtonLink href={upcoming.href} size="sm">Xem phiên</ButtonLink>
        </div>
      )}
      <div className="sc-thread">
      <Card className="sc-thread-main">
        <div className="chat max-h-[60vh] overflow-y-auto p-5 max-sm:p-4">
          {timeline.length === 0 && <div className="bubble-system bubble">Chưa có tin nhắn. Hãy mở đầu cuộc trò chuyện.</div>}
          {timeline.map((it, i) => {
            const prev = timeline[i - 1];
            const sep = (i === 0 || formatDate(prev.at) !== formatDate(it.at)) && <div className="sc-datesep">{formatDate(it.at)}</div>;
            if (it.kind === "file") {
              const f = it.f;
              return (
                <div key={`f-${f.id}`} className="group flex flex-col gap-1">
                  {sep}
                  <div className={`flex ${f.mine ? "justify-end" : ""}`}>
                    <div className="sc-file">
                      <FileText aria-hidden="true" />
                      <div className="grow">
                        {f.url ? <a href={f.url} download={f.name} onClick={(e) => downloadFile(e, f)}>{f.name}</a> : <b>{f.name}</b>}
                        <small>{formatBytes(f.size)}</small>
                      </div>
                    </div>
                  </div>
                  <div className={`bubble-meta ${f.mine ? "bubble-meta-me" : ""}`}>{f.mine ? "Bạn" : name} · {formatDateTime(f.createdAt)}</div>
                </div>
              );
            }
            const m = it.m;
            const flag = m.mine ? flags[m.id] : undefined;
            return (
              <div key={m.id} className="group flex flex-col gap-1">
                {sep}
                {flag && (
                  <div className="sc-contact-warn" role="note">
                    <TriangleAlert aria-hidden="true" /><span>{CONTACT_WARNING[flag]}</span>
                  </div>
                )}
                <div className={`bubble ${m.mine ? "bubble-me" : ""}`}>{m.body}</div>
                <div className={`bubble-meta flex items-center gap-2 ${m.mine ? "bubble-meta-me" : ""}`}>
                  {m.mine ? "Bạn" : name} · {formatDateTime(m.createdAt)}
                  {!m.mine && reporting !== m.id && (
                    <button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-ink-subtle hover:text-danger"
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
            );
          })}
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
              {draftContact && (
                <div className="sc-contact-warn" role="alert">
                  <TriangleAlert aria-hidden="true" /><span>{CONTACT_WARNING[draftContact]}</span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Chọn tệp đính kèm" onChange={(e) => attach(e.target.files)} />
                <Button variant="ghost" iconOnly icon={Paperclip} label="Đính kèm tệp" loading={uploading} disabled={blocked} onClick={() => fileInput.current?.click()} />
                <Textarea value={draft} maxLength={MESSAGE_MAX} disabled={blocked} rows={2} aria-label="Tin nhắn" className="min-h-[44px]"
                  placeholder={blocked ? "Bạn đã dùng hết lượt nhắn trước khi được chấp nhận" : "Nhập tin nhắn…"}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                  }} />
                <Button variant="primary" iconOnly icon={Send} label="Gửi" loading={sending} disabled={blocked || !draft.trim()} onClick={send} />
              </div>
              <span className="text-small text-ink-subtle tabular">{draft.length}/{MESSAGE_MAX} · Ctrl/⌘ + Enter để gửi · Tệp tối đa 10 MB</span>
            </>
          )}
        </div>
      </Card>
      <aside className="sc-thread-side" aria-label="Thông tin hội thoại">
        <section className="sc-side-card">
          <div className="flex items-center gap-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <b className="block truncate">{name}</b>
              <span className="text-small text-ink-muted">{c.counterpartRole === "MENTOR" ? "Mentor" : "Mentee"}</span>
            </div>
          </div>
          {presence && <p className="sc-presence mt-2" data-online={presence.online}><span className="dot" aria-hidden="true" />{presence.online ? "Đang hoạt động" : "Ngoại tuyến"}</p>}
          <div className="mt-3 flex flex-col gap-2">
            <ButtonLink href={authorHref(c.counterpartId, c.counterpartRole)} block>Xem trang cá nhân</ButtonLink>
            <ButtonLink href="/mentoring/requests" block>Xem yêu cầu mentoring</ButtonLink>
          </div>
        </section>
        <section className="sc-side-card">
          <h2>Tệp đã chia sẻ ({files.length})</h2>
          {files.length === 0 ? <p className="text-small text-ink-muted">Chưa có tệp nào trong hội thoại này.</p> : (
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li key={f.id} className="sc-file-row">
                  <FileText aria-hidden="true" />
                  {f.url ? <a href={f.url} download={f.name} onClick={(e) => downloadFile(e, f)} className="truncate">{f.name}</a> : <span className="truncate">{f.name}</span>}
                  <small>{formatBytes(f.size)}</small>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <Button block icon={muted ? Bell : BellOff} aria-pressed={muted} onClick={toggleMute}>{muted ? "Bật lại thông báo" : "Tắt thông báo hội thoại"}</Button>
          </div>
        </section>
        <section className="sc-side-card">
          <h2>Lưu ý</h2>
          <p className="text-small text-ink-muted">Hãy trao đổi và thanh toán trên MentorHub để được bảo vệ khi có sự cố. Bấm “Báo cáo” dưới tin nhắn của bên kia nếu có vi phạm; người bị báo cáo không biết ai đã báo.</p>
          <Link href="/mentoring/sessions" className="mt-2 inline-flex min-h-11 items-center text-small font-semibold text-accent-ink">Đến phiên học của tôi</Link>
        </section>
      </aside>
      </div>
    </div>
  );
}

export default function ThreadPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Thread id={params.id} />}</RequireAuth>;
}
