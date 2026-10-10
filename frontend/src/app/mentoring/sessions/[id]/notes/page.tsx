"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Lock, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
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
  if (state === "saving") return <span className="text-small text-ink-muted">Đang lưu…</span>;
  if (state === "dirty") return <span className="text-small text-ink-muted">Chưa lưu…</span>;
  if (state === "error") return <span className="text-small text-danger">Lưu thất bại. Kiểm tra kết nối rồi sửa tiếp để thử lại.</span>;
  return at ? <span className="text-small text-ink-subtle">Lưu lúc {formatDateTime(at)}{by ? ` bởi ${by}` : ""}</span> : null;
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
  return (
    <Card>
      <CardHeader title="Việc cần làm" description="Việc còn mở được mang sang phiên kế tiếp." />
      {notes.actionItems.length === 0 && <div className="px-5 py-4 text-ink-muted">Chưa có việc nào.</div>}
      <div className="flex flex-col divide-y divide-border">
        {notes.actionItems.map((a: ActionItem) => (
          <div key={a.id} className="flex items-start gap-3 px-5 py-3">
            <input type="checkbox" className="mt-1 size-4 flex-none accent-[var(--accent)]" aria-label={`Đánh dấu xong: ${a.text}`} checked={a.done}
              onChange={(e) => run(() => mentoringApi.updateActionItem(a.id, { done: e.target.checked }))} />
            <div className="min-w-0 flex-1">
              <div className={a.done ? "text-ink-muted line-through" : ""}>{a.text}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-small text-ink-muted">
                <span>{OWNER_LABELS[a.owner]}</span>
                {a.dueDate && <span className="tabular">hạn {formatDate(a.dueDate)}</span>}
                {a.carriedOver && <Badge>Từ phiên trước</Badge>}
                {a.overdue && <Badge tone="danger">Quá hạn</Badge>}
              </div>
            </div>
            <Button size="sm" variant="ghost" iconOnly icon={Trash2} label="Xoá việc" onClick={() => run(() => mentoringApi.deleteActionItem(a.id))} />
          </div>
        ))}
      </div>
      {notes.editable && own < notes.maxActionItems && (
        <form className="card-foot flex-wrap justify-start" onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length < 2) return;
          run(() => mentoringApi.addActionItem(notes.sessionId, { text: text.trim(), owner, dueDate: due || null }))
            .then(() => { setText(""); setDue(""); });
        }}>
          <Input className="min-w-[200px] flex-[2_1_240px]" value={text} maxLength={300} aria-label="Việc cần làm" placeholder="Thêm việc cần làm…" onChange={(e) => setText(e.target.value)} />
          <Select className="w-auto" aria-label="Người làm" value={owner} onChange={(e) => setOwner(e.target.value as ActionItemOwner)}>
            <option value="MENTEE">Mentee làm</option>
            <option value="MENTOR">Mentor làm</option>
          </Select>
          <Input className="w-auto" type="date" aria-label="Hạn" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button type="submit" icon={Plus} disabled={text.trim().length < 2}>Thêm</Button>
        </form>
      )}
    </Card>
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
      <PageHeader
        title="Ghi chú phiên"
        back={{ href: "/mentoring/sessions", label: "Phiên học" }}
        description={session ? <span className="inline-flex flex-wrap items-center gap-2">{other} · {formatDateTime(session.scheduledAt)} <MentoringStatusBadge status={session.status} labels={SESSION_STATUS_LABELS} /></span> : undefined}
      />
      <div className="flex flex-col gap-6">
        <Alert>{error}</Alert>
        {!notes.editable && <Alert tone="info">Phiên đã huỷ hoặc hết hạn, ghi chú chỉ còn để xem.</Alert>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {session?.agenda && (
              <div className="well">
                <div className="eyebrow mb-1">Agenda</div>
                <p className="whitespace-pre-wrap">{session.agenda}</p>
              </div>
            )}
            <Card>
              <CardHeader title="Ghi chú chung" description="Cả hai bên cùng xem và sửa. Tự lưu, hỗ trợ Markdown."
                actions={<SaveHint state={sharedState} at={notes.shared.updatedAt} by={notes.shared.updatedByName} />} />
              <CardBody className="flex flex-col gap-3">
                {conflictDraft !== null && (
                  <Alert tone="warning" title={`${other || "Người kia"} vừa cập nhật ghi chú`}
                    action={<Button size="sm" onClick={() => setConflictDraft(null)}>Đã chép lại</Button>}>
                    Bản của bạn chưa được lưu. Ô bên dưới là bản mới nhất; bản của bạn:
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-small">{conflictDraft}</pre>
                  </Alert>
                )}
                <Textarea rows={16} value={shared} maxLength={20000} disabled={!notes.editable} aria-label="Ghi chú chung"
                  className="font-mono text-small leading-6"
                  placeholder="Câu hỏi chuẩn bị, nội dung đã trao đổi, link tài liệu…"
                  onChange={(e) => { setShared(e.target.value); sharedDirty.current = true; setSharedState("dirty"); }} />
              </CardBody>
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <ActionItems notes={notes} setError={setError} onChange={() => reload(false).catch(() => {})} />
            {notes.privateNote && (
              <Card>
                <CardHeader title={<span className="inline-flex items-center gap-2"><Lock aria-hidden="true" className="size-4 text-ink-muted" />Ghi chú riêng</span>}
                  description="Mentee không nhìn thấy ghi chú này."
                  actions={<SaveHint state={privState} at={notes.privateNote.updatedAt} />} />
                <CardBody>
                  <Textarea rows={8} value={priv} maxLength={10000} aria-label="Ghi chú riêng"
                    placeholder="Nhận xét, điểm cần theo dõi ở phiên sau…"
                    onChange={(e) => { setPriv(e.target.value); setPrivState("dirty"); }} />
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function SessionNotesPage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Notes id={params.id} />}</RequireAuth>;
}
