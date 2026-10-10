"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ArrowDown, ArrowUp, CalendarPlus, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, FlashAlerts, Input, Loading, PageHeader, Progress, Select, Textarea, useDialog, type BadgeTone, type Flash } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { SESSION_STATUS_LABELS } from "@/features/mentoring/labels";
import { SESSION_TYPE_LABELS } from "@/features/profile/api";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
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

const GOAL_TONE: Record<GoalStatus, BadgeTone> = { TODO: "neutral", IN_PROGRESS: "info", DONE: "success" };

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
      <Alert action={<ButtonLink href="/mentoring/relationships" size="sm">Quan hệ mentoring</ButtonLink>}>
        {flash.error || "Không tìm thấy không gian mentoring."}
      </Alert>
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
      <PageHeader
        back={{ href: "/mentoring/relationships", label: "Quan hệ mentoring" }}
        title={`Mentoring với ${partner || "—"}`}
        description={`${r.sessionType ? SESSION_TYPE_LABELS[r.sessionType] : "Mentoring"} · ${RELATIONSHIP_STATUS_LABELS[r.status] || r.status}`}
        actions={<>
          {isParticipant && <ButtonLink href={`/messages/${r.id}`} icon={MessageSquare}>Nhắn tin</ButtonLink>}
          {isMentee && !readOnly && <ButtonLink href={`/mentoring/book/${r.mentorId}`} variant="primary" icon={CalendarPlus}>Đặt buổi</ButtonLink>}
        </>}
      />
      <div className="flex flex-col gap-6">
        <FlashAlerts flash={flash} />
        {readOnly && <Alert tone="info">Quan hệ mentoring này đã kết thúc, không gian chỉ còn để xem lại.</Alert>}
        {!isParticipant && <Alert tone="info">Bạn đang xem với quyền quản trị viên (chỉ đọc).</Alert>}

        {ending && (
          <form onSubmit={endMentoring}>
            <Card>
              <CardHeader title="Kết thúc mentoring" description="Các phiên sắp tới sẽ bị huỷ theo chính sách huỷ phiên." />
              <CardBody className="flex flex-col gap-4">
                <Field label="Lý do" id="end-reason">
                  <Select id="end-reason" value={ending.reason} onChange={(e) => setEnding({ ...ending, reason: e.target.value as EndMentoringReason })}>
                    {END_REASONS.map((x) => <option key={x} value={x}>{END_REASON_LABELS[x]}</option>)}
                  </Select>
                </Field>
                <Field label="Ghi chú" id="end-note" hint="Không bắt buộc, tối đa 500 ký tự.">
                  <Textarea id="end-note" maxLength={500} value={ending.note} onChange={(e) => setEnding({ ...ending, note: e.target.value })} />
                </Field>
              </CardBody>
              <CardFooter>
                <Button variant="ghost" onClick={() => setEnding(null)}>Huỷ</Button>
                <Button type="submit" variant="danger" loading={busy}>Kết thúc mentoring</Button>
              </CardFooter>
            </Card>
          </form>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader title="Mục tiêu chung" description={`${doneCount}/${goals.length} đã xong · tối đa ${maxGoals} mục tiêu`} />
            {goals.length > 0 && <div className="px-5 pt-4"><Progress value={goals.length ? (doneCount / goals.length) * 100 : 0} label="Tiến độ mục tiêu" /></div>}
            <div className="flex flex-col divide-y divide-border">
              {goals.map((g, i) => (
                <div key={g.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  {editing?.id === g.id ? (
                    <form onSubmit={saveEdit} className="flex flex-1 flex-col gap-2">
                      <Textarea aria-label="Nội dung mục tiêu" value={editing.text} maxLength={GOAL_TEXT_MAX} className="min-h-[72px]" onChange={(e) => setEditing({ id: g.id, text: e.target.value })} />
                      <div className="form-actions">
                        <Button type="submit" size="sm" variant="primary" loading={busy}>Lưu</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Huỷ</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span className="w-6 flex-none pt-0.5 font-mono text-small text-ink-subtle tabular">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className={g.status === "DONE" ? "text-ink-muted line-through" : ""}>{g.text}</div>
                        {!canEdit && <div className="mt-1"><Badge tone={GOAL_TONE[g.status]}>{GOAL_STATUS_LABELS[g.status]}</Badge></div>}
                      </div>
                      {canEdit && (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Select aria-label="Trạng thái mục tiêu" value={g.status} disabled={busy} className="h-[30px] w-auto text-small"
                            onChange={(e) => run(() => workspaceApi.updateGoal(id, g.id, { status: e.target.value as GoalStatus }))}>
                            {GOAL_STATUSES.map((st) => <option key={st} value={st}>{GOAL_STATUS_LABELS[st]}</option>)}
                          </Select>
                          <Button size="sm" variant="ghost" iconOnly icon={ArrowUp} label="Lên" disabled={busy || i === 0} onClick={() => move(i, -1)} />
                          <Button size="sm" variant="ghost" iconOnly icon={ArrowDown} label="Xuống" disabled={busy || i === goals.length - 1} onClick={() => move(i, 1)} />
                          <Button size="sm" variant="ghost" iconOnly icon={Pencil} label="Sửa" disabled={busy} onClick={() => setEditing({ id: g.id, text: g.text })} />
                          <Button size="sm" variant="ghost" iconOnly icon={Trash2} disabled={busy || goals.length <= 1}
                            label={goals.length <= 1 ? "Cần giữ ít nhất 1 mục tiêu" : "Xoá"} onClick={() => remove(g)} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            {canEdit && goals.length < maxGoals && (
              <form onSubmit={addGoal} className="card-foot">
                <div className="input-group w-full">
                  <Input aria-label="Mục tiêu mới" placeholder={`Thêm mục tiêu (${GOAL_TEXT_MIN}–${GOAL_TEXT_MAX} ký tự)`} value={newGoal} maxLength={GOAL_TEXT_MAX}
                    onChange={(e) => setNewGoal(e.target.value)} />
                  <Button type="submit" icon={Plus} loading={busy}>Thêm</Button>
                </div>
              </form>
            )}
          </Card>

          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader title="Buổi học" actions={<Link className="text-small" href="/mentoring/sessions">Tất cả phiên học</Link>} />
              {sessions.length === 0 ? (
                <EmptyState title="Chưa có buổi nào">{isMentee && !readOnly ? "Bấm “Đặt buổi” để đặt lịch." : undefined}</EmptyState>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="tabular">{formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút</div>
                        <div className="text-small text-ink-muted">{s.sessionType ? SESSION_TYPE_LABELS[s.sessionType] : ""}{s.topic ? ` · ${s.topic}` : ""}</div>
                      </div>
                      <MentoringStatusBadge status={s.status} labels={SESSION_STATUS_LABELS} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            {ws.openActionItems?.length > 0 && (
              <Card>
                <CardHeader title="Việc cần làm còn mở" />
                <div className="flex flex-col divide-y divide-border">
                  {ws.openActionItems.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div>{a.text}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-small text-ink-muted">
                          <span>{a.owner === "MENTOR" ? "Mentor" : "Mentee"}</span>
                          {a.dueDate && <span className="tabular">hạn {formatDate(a.dueDate)}</span>}
                          {a.overdue && <Badge tone="danger">Quá hạn</Badge>}
                        </div>
                      </div>
                      <Link className="text-small" href={`/mentoring/sessions/${a.sessionId}/notes`}>Mở ghi chú</Link>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card>
              <CardHeader title="Mục tiêu ban đầu trong yêu cầu" />
              <CardBody><p className="whitespace-pre-wrap">{r.goal}</p></CardBody>
            </Card>
            {isParticipant && !readOnly && !ending && (
              <div><Button variant="danger-quiet" onClick={() => setEnding({ reason: "GOAL_REACHED", note: "" })}>Kết thúc mentoring</Button></div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function WorkspacePage({ params }: { params: { id: string } }) {
  return <RequireAuth roles={["MENTEE", "MENTOR", "ADMIN"]}>{(user) => <Workspace user={user} id={params.id} />}</RequireAuth>;
}
