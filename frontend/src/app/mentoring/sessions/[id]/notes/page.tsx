"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { SESSION_STATUS_LABELS } from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ActionItem, ActionItemOwner, MentoringSession, SessionNotes } from "@/types";

const AUTOSAVE_MS = 1500;
const REFRESH_MS = 15000;
const OWNER_LABELS: Record<ActionItemOwner, string> = { MENTEE: "Mentee", MENTOR: "Mentor" };

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Trạng thái lưu tự động hiển thị dưới ô soạn. */
function SaveHint({ state, at, by }: { state: SaveState; at?: string | null; by?: string | null }) {
  if (state === "saving") return <span className="small muted">Đang lưu…</span>;
  if (state === "dirty") return <span className="small muted">Chưa lưu…</span>;
  if (state === "error") return <span className="small" style={{ color: "var(--color-danger, #c0392b)" }}>Lưu thất bại</span>;
  return at ? <span className="small muted">Lưu lúc {formatDateTime(at)}{by ? ` bởi ${by}` : ""}</span> : null;
}

function ActionItems({ notes, onChange, setError }: {
  notes: SessionNotes;
  onChange: () => void;
  setError: (e: string) => void;
}) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState<ActionItemOwner>(notes.viewerRole === "MENTOR" ? "MENTEE" : "MENTEE");
  const [due, setDue] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const own = notes.actionItems.filter((a) => !a.carriedOver).length;
  const row = (a: ActionItem) => (
    <div key={a.id} className="list-item row between">
      <label className="row" style={{ gap: 8, alignItems: "flex-start", flex: 1 }}>
        <input type="checkbox" checked={a.done} onChange={(e) => run(() => mentoringApi.updateActionItem(a.id, { done: e.target.checked }))} />
        <span style={{ textDecoration: a.done ? "line-through" : undefined }}>
          {a.text}
          <span className="small muted"> · {OWNER_LABELS[a.owner]}{a.dueDate ? ` · hạn ${formatDate(a.dueDate)}` : ""}</span>
          {a.carriedOver && <span className="badge" style={{ marginLeft: 6 }}>Từ phiên trước</span>}
          {a.overdue && <span className="badge bad" style={{ marginLeft: 6 }}>Quá hạn</span>}
        </span>
      </label>
      <button className="btn secondary sm" onClick={() => run(() => mentoringApi.deleteActionItem(a.id))}>Xoá</button>
    </div>
  );
  return (
    <div className="card stack">
      <h2>Việc cần làm</h2>
      {notes.actionItems.length === 0 && <div className="small muted">Chưa có việc nào. Việc còn mở sẽ được mang sang phiên kế tiếp.</div>}
      {notes.actionItems.map(row)}
      {notes.editable && own < notes.maxActionItems && (
        <form className="row" style={{ flexWrap: "wrap", gap: 8 }} onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length < 2) return;
          run(() => mentoringApi.addActionItem(notes.sessionId, { text: text.trim(), owner, dueDate: due || null }))
            .then(() => { setText(""); setDue(""); });
        }}>
          <input style={{ flex: "2 1 240px" }} value={text} maxLength={300} placeholder="Việc cần làm…" onChange={(e) => setText(e.target.value)} />
          <select value={owner} onChange={(e) => setOwner(e.target.value as ActionItemOwner)}>
            <option value="MENTEE">Mentee làm</option>
            <option value="MENTOR">Mentor làm</option>
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="btn sm" disabled={text.trim().length < 2}>Thêm</button>
        </form>
      )}
    </div>
  );
}

/** US-40 — trang ghi chú của một phiên. */
function Notes({ id }: { id: string }) {
  const [session, setSession] = useState<MentoringSession | null>(null);
  const [notes, setNotes] = useState<SessionNotes | null>(null);
  const [shared, setShared] = useState("");
  const [sharedState, setSharedState] = useState<SaveState>("idle");
  const [conflictDraft, setConflictDraft] = useState<string | null>(null);
  const [priv, setPriv] = useState("");
  const [privState, setPrivState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const version = useRef(0);
  const sharedDirty = useRef(false);

  const reload = useCallback(async (replaceShared: boolean) => {
    const n = await mentoringApi.sessionNotes(id);
    setNotes(n);
    if (replaceShared || !sharedDirty.current) {
      setShared(n.shared.content);
      version.current = n.shared.version;
    }
    return n;
  }, [id]);

  useEffect(() => {
    mentoringApi.session(id).then(setSession).catch((e) => setError(errorMessage(e)));
    reload(true).then((n) => setPriv(n.privateNote?.content ?? "")).catch((e) => setError(errorMessage(e)));
  }, [id, reload]);

  // Lấy bản mới của người kia khi mình không có thay đổi chưa lưu.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !sharedDirty.current) reload(false).catch(() => {});
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  // Autosave ghi chú chung.
  useEffect(() => {
    if (sharedState !== "dirty") return;
    const t = setTimeout(async () => {
      setSharedState("saving");
      try {
        const saved = await mentoringApi.saveSharedNote(id, shared, version.current);
        version.current = saved.version;
        sharedDirty.current = false;
        setNotes((n) => (n ? { ...n, shared: saved } : n));
        setSharedState("saved");
      } catch (e) {
        if (e instanceof ApiError && e.code === "NOTES_CONFLICT") {
          setConflictDraft(shared);
          sharedDirty.current = false;
          await reload(true).catch(() => {});
          setSharedState("idle");
        } else {
          setError(errorMessage(e));
          setSharedState("error");
        }
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [shared, sharedState, id, reload]);

  // Autosave ghi chú riêng (mentor).
  useEffect(() => {
    if (privState !== "dirty") return;
    const t = setTimeout(async () => {
      setPrivState("saving");
      try {
        const saved = await mentoringApi.savePrivateNote(id, priv);
        setNotes((n) => (n ? { ...n, privateNote: saved } : n));
        setPrivState("saved");
      } catch (e) {
        setError(errorMessage(e));
        setPrivState("error");
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [priv, privState, id]);

  if (!notes) return error ? <Alert>{error}</Alert> : <Loading />;
  const other = session ? (notes.viewerRole === "MENTOR" ? session.menteeName : session.mentorName) : null;

  return (
    <>
      <PageHead
        title="Ghi chú phiên"
        subtitle={session ? <>{other} · {formatDateTime(session.scheduledAt)} <MentoringStatusBadge status={session.status} labels={SESSION_STATUS_LABELS} /></> : undefined}
      >
        <Link className="btn secondary sm" href="/mentoring/sessions">← Phiên học</Link>
      </PageHead>
      <Alert>{error}</Alert>
      {!notes.editable && <Alert type="info">Phiên đã huỷ / hết hạn — ghi chú chỉ còn để xem.</Alert>}
      {session?.agenda && (
        <div className="card small" style={{ whiteSpace: "pre-wrap" }}><strong>Agenda:</strong> {session.agenda}</div>
      )}
      <div className="card stack" style={{ marginTop: 12 }}>
        <div className="row between">
          <h2>Ghi chú chung</h2>
          <SaveHint state={sharedState} at={notes.shared.updatedAt} by={notes.shared.updatedByName} />
        </div>
        {conflictDraft !== null && (
          <Alert type="warn">
            {other || "Người kia"} vừa cập nhật ghi chú nên bản của bạn chưa được lưu. Ghi chú dưới đây là bản mới nhất; bản của bạn:
            <pre className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{conflictDraft}</pre>
            <button className="btn secondary sm" onClick={() => setConflictDraft(null)}>Đã chép lại, ẩn bản này</button>
          </Alert>
        )}
        <textarea rows={12} value={shared} maxLength={20000} disabled={!notes.editable}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          placeholder="Markdown: câu hỏi chuẩn bị, nội dung đã trao đổi, link tài liệu…"
          onChange={(e) => { setShared(e.target.value); sharedDirty.current = true; setSharedState("dirty"); }} />
        <span className="small muted">Cả hai bên cùng xem và sửa · tự lưu sau {AUTOSAVE_MS / 1000} giây · hỗ trợ Markdown</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <ActionItems notes={notes} setError={setError} onChange={() => reload(false).catch(() => {})} />
      </div>
      {notes.privateNote && (
        <div className="card stack" style={{ marginTop: 12 }}>
          <div className="row between">
            <h2>Ghi chú riêng của mentor</h2>
            <SaveHint state={privState} at={notes.privateNote.updatedAt} />
          </div>
          <textarea rows={6} value={priv} maxLength={10000}
            placeholder="Chỉ bạn nhìn thấy — nhận xét, điểm cần theo dõi ở phiên sau…"
            onChange={(e) => { setPriv(e.target.value); setPrivState("dirty"); }} />
          <span className="small muted">Mentee không nhìn thấy ghi chú này.</span>
        </div>
      )}
    </>
  );
}

export default function SessionNotesPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Notes id={params.id} />}</RequireAuth>;
}
