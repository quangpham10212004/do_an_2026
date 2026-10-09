"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, useDialog, type Flash } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { SESSION_STATUS_LABELS } from "@/features/mentoring/labels";
import { SESSION_TYPE_LABELS } from "@/features/profile/api";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { EndMentoringReason, GoalStatus, RelationshipGoal, RelationshipWorkspace, SessionUser } from "@/types";
import {
  END_REASONS,
  END_REASON_LABELS,
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  GOAL_TEXT_MAX,
  GOAL_TEXT_MIN,
  RELATIONSHIP_STATUS_LABELS,
  workspaceApi,
} from "../workspace";

const GOAL_TONE: Record<GoalStatus, string> = { TODO: "", IN_PROGRESS: "warn", DONE: "good" };

/** US-28 (PRD-REQ-5) — không gian mentoring: bảng mục tiêu, danh sách buổi học, đặt buổi, kết thúc mentoring. */
function Workspace({ user, id }: { user: SessionUser; id: string }) {
  const [ws, setWs] = useState<RelationshipWorkspace | null | undefined>(undefined);
  const [flash, setFlash] = useState<Flash>({});
  const [newGoal, setNewGoal] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<{ reason: EndMentoringReason; note: string } | null>(null);
  const [dialog, ask] = useDialog();

  const load = useCallback(
    () => workspaceApi.get(id).then(setWs).catch((e: unknown) => {
      setWs(null);
      setFlash({ error: errorMessage(e) });
    }),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  /** Chạy một thao tác ghi rồi tải lại workspace (giữ đồng bộ khi bên kia cũng vừa sửa). */
  async function run(action: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setFlash({});
    try {
      await action();
      if (ok) setFlash({ ok });
      await load();
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (ws === undefined) return <Loading />;
  if (!ws) {
    return (
      <>
        <Alert>{flash.error || "Không tìm thấy không gian mentoring."}</Alert>
        <Link href="/mentoring/relationships">← Danh sách quan hệ mentoring</Link>
      </>
    );
  }

  const { request: r, goals, sessions, canEdit, readOnly, maxGoals } = ws;
  const isMentee = user.userId === r.menteeId;
  const isParticipant = isMentee || user.userId === r.mentorId;
  const partner = isMentee ? r.mentorName : user.userId === r.mentorId ? r.menteeName : `${r.mentorName} – ${r.menteeName}`;
  const doneCount = goals.filter((g) => g.status === "DONE").length;
  const textOk = (t: string) => t.trim().length >= GOAL_TEXT_MIN && t.trim().length <= GOAL_TEXT_MAX;

  function addGoal(e: FormEvent) {
    e.preventDefault();
    if (!textOk(newGoal)) {
      setFlash({ error: `Mục tiêu cần từ ${GOAL_TEXT_MIN} đến ${GOAL_TEXT_MAX} ký tự.` });
      return;
    }
    run(() => workspaceApi.addGoal(id, newGoal.trim()).then(() => setNewGoal("")), "Đã thêm mục tiêu.");
  }

  function move(index: number, delta: number) {
    const order = goals.map((g) => g.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    run(() => workspaceApi.reorder(id, order));
  }

  async function remove(g: RelationshipGoal) {
    const ok = await ask({ title: "Xoá mục tiêu?", message: g.text, confirmText: "Xoá", danger: true });
    if (ok) run(() => workspaceApi.deleteGoal(id, g.id), "Đã xoá mục tiêu.");
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!textOk(editing.text)) {
      setFlash({ error: `Mục tiêu cần từ ${GOAL_TEXT_MIN} đến ${GOAL_TEXT_MAX} ký tự.` });
      return;
    }
    run(() => workspaceApi.updateGoal(id, editing.id, { text: editing.text.trim() }).then(() => setEditing(null)));
  }

  async function endMentoring(e: FormEvent) {
    e.preventDefault();
    if (!ending) return;
    setBusy(true);
    setFlash({});
    try {
      await workspaceApi.end(id, { reason: ending.reason, note: ending.note.trim() || undefined });
      setEnding(null);
      setFlash({ ok: "Đã kết thúc quan hệ mentoring. Không gian chuyển sang chế độ chỉ xem." });
      await load();
    } catch (err) {
      setFlash({
        error: err instanceof ApiError && err.status === 404
          ? "Chức năng kết thúc mentoring chưa sẵn sàng (US-31) — vui lòng thử lại sau."
          : errorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {dialog}
      <PageHead
        title={`Mentoring với ${partner || "—"}`}
        subtitle={`${r.sessionType ? SESSION_TYPE_LABELS[r.sessionType] : "Mentoring"} · ${RELATIONSHIP_STATUS_LABELS[r.status] || r.status}`}
      >
        {isMentee && !readOnly && <Link className="btn" href={`/mentoring/book/${r.mentorId}`}>Đặt buổi</Link>}
        {isParticipant && !readOnly && !ending && (
          <button className="btn secondary" onClick={() => setEnding({ reason: "GOAL_REACHED", note: "" })}>Kết thúc mentoring</button>
        )}
      </PageHead>
      <Alert type="success">{flash.ok}</Alert>
      <Alert>{flash.error}</Alert>
      {readOnly && <Alert type="info">Quan hệ mentoring này đã kết thúc — không gian chỉ còn để xem lại.</Alert>}
      {!isParticipant && <Alert type="info">Bạn đang xem với quyền quản trị viên (chỉ đọc).</Alert>}

      {ending && (
        <form className="card stack" onSubmit={endMentoring} style={{ marginBottom: "1rem" }}>
          <h2>Kết thúc mentoring</h2>
          <div className="field">
            <label htmlFor="end-reason">Lý do</label>
            <select id="end-reason" value={ending.reason} onChange={(e) => setEnding({ ...ending, reason: e.target.value as EndMentoringReason })}>
              {END_REASONS.map((x) => <option key={x} value={x}>{END_REASON_LABELS[x]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="end-note">Ghi chú (không bắt buộc)</label>
            <textarea id="end-note" maxLength={500} value={ending.note} onChange={(e) => setEnding({ ...ending, note: e.target.value })} />
          </div>
          <div className="row">
            <button className="btn danger" disabled={busy}>Xác nhận kết thúc</button>
            <button type="button" className="btn secondary" onClick={() => setEnding(null)}>Huỷ</button>
          </div>
        </form>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="row between">
            <h2>Mục tiêu</h2>
            <span className="small muted">{doneCount}/{goals.length} đã xong · tối đa {maxGoals}</span>
          </div>
          {goals.map((g, i) => (
            <div key={g.id} className="list-item" style={{ alignItems: "flex-start", gap: 8 }}>
              {editing?.id === g.id ? (
                <form onSubmit={saveEdit} className="stack" style={{ flex: 1 }}>
                  <textarea value={editing.text} maxLength={GOAL_TEXT_MAX} onChange={(e) => setEditing({ id: g.id, text: e.target.value })} />
                  <div className="row">
                    <button className="btn sm" disabled={busy}>Lưu</button>
                    <button type="button" className="btn sm secondary" onClick={() => setEditing(null)}>Huỷ</button>
                  </div>
                </form>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ textDecoration: g.status === "DONE" ? "line-through" : undefined }}>{g.text}</div>
                    {!canEdit && <span className={`badge ${GOAL_TONE[g.status]}`}>{GOAL_STATUS_LABELS[g.status]}</span>}
                  </div>
                  {canEdit && (
                    <div className="row" style={{ gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <select aria-label="Trạng thái mục tiêu" value={g.status} disabled={busy} style={{ width: "auto" }}
                        onChange={(e) => run(() => workspaceApi.updateGoal(id, g.id, { status: e.target.value as GoalStatus }))}>
                        {GOAL_STATUSES.map((s) => <option key={s} value={s}>{GOAL_STATUS_LABELS[s]}</option>)}
                      </select>
                      <button className="btn sm secondary" title="Lên" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="btn sm secondary" title="Xuống" disabled={busy || i === goals.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button className="btn sm secondary" disabled={busy} onClick={() => setEditing({ id: g.id, text: g.text })}>Sửa</button>
                      <button className="btn sm danger" disabled={busy || goals.length <= 1} title={goals.length <= 1 ? "Cần giữ ít nhất 1 mục tiêu" : "Xoá"}
                        onClick={() => remove(g)}>Xoá</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {canEdit && goals.length < maxGoals && (
            <form onSubmit={addGoal} className="row" style={{ marginTop: "0.75rem" }}>
              <input placeholder={`Thêm mục tiêu (${GOAL_TEXT_MIN}–${GOAL_TEXT_MAX} ký tự)`} value={newGoal} maxLength={GOAL_TEXT_MAX}
                onChange={(e) => setNewGoal(e.target.value)} />
              <button className="btn sm" disabled={busy}>Thêm</button>
            </form>
          )}
        </div>

        <div className="card">
          <div className="row between">
            <h2>Buổi học</h2>
            <Link className="small" href="/mentoring/sessions">Tất cả phiên học →</Link>
          </div>
          {sessions.length === 0 && <Empty>Chưa có buổi nào.{isMentee && !readOnly ? " Bấm \"Đặt buổi\" để đặt lịch." : ""}</Empty>}
          {sessions.map((s) => (
            <div key={s.id} className="list-item row between">
              <div>
                <div>{formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút</div>
                <div className="small muted">{s.sessionType ? SESSION_TYPE_LABELS[s.sessionType] : ""}{s.topic ? ` · ${s.topic}` : ""}</div>
              </div>
              <MentoringStatusBadge status={s.status} labels={SESSION_STATUS_LABELS} />
            </div>
          ))}
          <h3 style={{ marginTop: "1rem" }}>Mục tiêu ban đầu trong yêu cầu</h3>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>{r.goal}</p>
        </div>
      </div>
      <p className="small" style={{ marginTop: "1rem" }}><Link href="/mentoring/relationships">← Danh sách quan hệ mentoring</Link></p>
    </>
  );
}

export default function WorkspacePage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR", "ADMIN"]}>{(user) => <Workspace user={user} id={params.id} />}</RequireAuth>;
}
