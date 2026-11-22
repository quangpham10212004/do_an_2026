"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Plus, Send, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Input, Loading, Select, Tabs, Textarea } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { roomChatApi, type RoomChatMessage } from "@/features/sesx/api";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { ActionItemOwner, SessionNotes, Uuid } from "@/types";

type Tab = "shared" | "private" | "todo" | "chat";
type Save = "idle" | "dirty" | "saving" | "saved" | "error";
const AUTOSAVE_MS = 1500;
const REFRESH_MS = 15000;

function hint(s: Save): string {
  return s === "saving" ? "Đang lưu…" : s === "dirty" ? "Chưa lưu…" : s === "saved" ? "● Đã tự lưu" : s === "error" ? "Lưu thất bại, sửa tiếp để thử lại" : "";
}

/** Cột phải của phòng học: ghi chú chung / riêng, việc cần làm (API ghi chú phiên có sẵn) và chat 2 người (mock). */
export default function RoomPanel({ sessionId, myName }: { sessionId: Uuid; myName: string }) {
  const [tab, setTab] = useState<Tab>("shared");
  const [notes, setNotes] = useState<SessionNotes | null>(null);
  const [shared, setShared] = useState("");
  const [sharedState, setSharedState] = useState<Save>("idle");
  const [priv, setPriv] = useState("");
  const [privState, setPrivState] = useState<Save>("idle");
  const [error, setError] = useState("");
  const version = useRef(0);
  const dirty = useRef(false);

  const reload = useCallback(async (replace: boolean) => {
    const n = await mentoringApi.sessionNotes(sessionId);
    setNotes(n);
    if (replace || !dirty.current) { setShared(n.shared.content); version.current = n.shared.version; }
    return n;
  }, [sessionId]);

  useEffect(() => {
    reload(true).then((n) => setPriv(n.privateNote?.content ?? "")).catch((e) => setError(errorMessage(e)));
  }, [reload]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && !dirty.current) reload(false).catch(() => {}); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (sharedState !== "dirty") return;
    const t = setTimeout(async () => {
      setSharedState("saving");
      try {
        const saved = await mentoringApi.saveSharedNote(sessionId, shared, version.current);
        version.current = saved.version;
        dirty.current = false;
        setSharedState("saved");
      } catch (e) {
        if (e instanceof ApiError && e.code === "NOTES_CONFLICT") {
          dirty.current = false;
          await reload(true).catch(() => {});
          setError("Người kia vừa cập nhật ghi chú chung; bản mới nhất đã được tải lại.");
          setSharedState("idle");
        } else { setError(errorMessage(e)); setSharedState("error"); }
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [shared, sharedState, sessionId, reload]);

  useEffect(() => {
    if (privState !== "dirty") return;
    const t = setTimeout(async () => {
      setPrivState("saving");
      try { await mentoringApi.savePrivateNote(sessionId, priv); setPrivState("saved"); }
      catch (e) { setError(errorMessage(e)); setPrivState("error"); }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [priv, privState, sessionId]);

  if (!notes) return error ? <Alert>{error}</Alert> : <Loading />;
  const open = notes.actionItems.filter((a) => !a.done).length;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "shared", label: "Ghi chú chung" },
    ...(notes.privateNote ? [{ id: "private" as Tab, label: "Riêng" }] : []),
    { id: "todo", label: "Việc cần làm", count: open },
    { id: "chat", label: "Chat" },
  ];

  return (
    <section className="ses-sec ses-roompanel" aria-label="Ghi chú và việc cần làm">
      <Tabs value={tab} onChange={setTab} tabs={tabs} className="px-3" />
      <div className="ses-sec-body flex flex-col gap-3">
        <Alert>{error}</Alert>
        {tab === "shared" && (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-small text-ink-muted"><span>Cả hai bên cùng xem và sửa · Markdown</span><span>{hint(sharedState)}</span></div>
            <Textarea rows={14} value={shared} maxLength={20000} disabled={!notes.editable} aria-label="Ghi chú chung" className="font-mono text-small leading-6"
              placeholder="Nội dung đã trao đổi, link tài liệu…"
              onChange={(e) => { setShared(e.target.value); dirty.current = true; setSharedState("dirty"); }} />
          </>
        )}
        {tab === "private" && notes.privateNote && (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-small text-ink-muted"><span className="inline-flex items-center gap-1"><Lock className="size-3.5" aria-hidden="true" />Mentee không nhìn thấy</span><span>{hint(privState)}</span></div>
            <Textarea rows={14} value={priv} maxLength={10000} aria-label="Ghi chú riêng" placeholder="Nhận xét, điểm cần theo dõi ở phiên sau…"
              onChange={(e) => { setPriv(e.target.value); setPrivState("dirty"); }} />
          </>
        )}
        {tab === "todo" && <Todo notes={notes} setError={setError} onChange={() => reload(false).catch(() => {})} />}
        {tab === "chat" && <Chat sessionId={sessionId} myName={myName} />}
      </div>
    </section>
  );
}

function Todo({ notes, onChange, setError }: { notes: SessionNotes; onChange: () => void; setError: (e: string) => void }) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState<ActionItemOwner>("MENTEE");
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); onChange(); return true; } catch (e) { setError(errorMessage(e)); return false; }
  };
  const own = notes.actionItems.filter((a) => !a.carriedOver).length;
  return (
    <>
      {notes.actionItems.length === 0 && <p className="text-ink-muted">Chưa có việc nào.</p>}
      <ul className="flex flex-col">
        {notes.actionItems.map((a) => (
          <li key={a.id} className="ses-todo" data-done={a.done}>
            <input type="checkbox" className="mt-1 size-5 flex-none accent-[var(--accent)]" aria-label={`Đánh dấu xong: ${a.text}`} checked={a.done}
              onChange={(e) => run(() => mentoringApi.updateActionItem(a.id, { done: e.target.checked }))} />
            <span className="min-w-0 flex-1">{a.text}
              <small className="mt-0.5 flex flex-wrap items-center gap-2 text-ink-muted">
                {a.owner === "MENTOR" ? "Mentor" : "Mentee"}{a.dueDate && ` · hạn ${formatDate(a.dueDate)}`}
                {a.carriedOver && <Badge>Từ phiên trước</Badge>}{a.overdue && <Badge tone="danger">Quá hạn</Badge>}
              </small>
            </span>
            <Button size="sm" variant="ghost" iconOnly icon={Trash2} label="Xoá việc" onClick={() => run(() => mentoringApi.deleteActionItem(a.id))} />
          </li>
        ))}
      </ul>
      {notes.editable && own < notes.maxActionItems && (
        <form className="flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length < 2) return;
          run(() => mentoringApi.addActionItem(notes.sessionId, { text: text.trim(), owner })).then((ok) => ok && setText(""));
        }}>
          <Input className="min-w-[160px] flex-[2_1_180px]" value={text} maxLength={300} aria-label="Việc cần làm" placeholder="Thêm việc cần làm…" onChange={(e) => setText(e.target.value)} />
          <Select className="w-auto" aria-label="Người làm" value={owner} onChange={(e) => setOwner(e.target.value as ActionItemOwner)}>
            <option value="MENTEE">Mentee làm</option><option value="MENTOR">Mentor làm</option>
          </Select>
          <Button type="submit" icon={Plus} disabled={text.trim().length < 2}>Thêm</Button>
        </form>
      )}
    </>
  );
}

function Chat({ sessionId, myName }: { sessionId: Uuid; myName: string }) {
  const [msgs, setMsgs] = useState<RoomChatMessage[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const load = () => roomChatApi.list(sessionId).then(setMsgs).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [sessionId]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [msgs.length]);
  return (
    <>
      <div className="ses-chat" role="log" aria-label="Chat trong phòng">
        {msgs.length === 0 && <p className="text-small text-ink-muted">Chưa có tin nhắn. Chat video của Jitsi cũng dùng được trong khung họp.</p>}
        {msgs.map((m) => (
          <div key={m.id} className="ses-chat-msg" data-mine={m.mine}>
            <small>{m.mine ? "Bạn" : m.senderName} · {new Date(m.sentAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</small>
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        setText("");
        await roomChatApi.send(sessionId, t).catch(() => {});
        roomChatApi.list(sessionId).then(setMsgs).catch(() => {});
      }}>
        <Input className="min-w-0 flex-1" value={text} maxLength={500} aria-label="Tin nhắn" placeholder="Nhập tin nhắn…" onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="primary" iconOnly icon={Send} label="Gửi" disabled={!text.trim()} />
      </form>
    </>
  );
}
