"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Check, DoorOpen, RotateCcw, UserX, Video, X } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, DescriptionList, Field, FlashAlerts, Input, StatusBadge, Table, Textarea, useDialog, type Flash } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Recommendation, Round2Criterion, Round2Decision, Round2Interview, Round2Scores, VerificationApplication, VerificationState } from "@/types";

/** Phiếu chấm thống nhất (docs/design-mentor-verification.md §6.3): cùng thang 0–10 và cùng ngưỡng khuyến nghị với vòng 1. */
export const ROUND2_CRITERIA: { key: Round2Criterion; label: string; weight: number; hint: string }[] = [
  { key: "technical", label: "Kỹ thuật", weight: 30, hint: "0–2: sai / lạc đề · 3–6: đúng nhưng chung chung · 7–10: đúng, nêu được đánh đổi, xử lý tốt câu đào sâu" },
  { key: "depth", label: "Kinh nghiệm thực tế", weight: 25, hint: "0–2: không có ví dụ / không khớp hồ sơ · 3–6: có dự án nhưng mơ hồ · 7–10: dự án thực tế, vai trò rõ, số liệu" },
  { key: "communication", label: "Giao tiếp", weight: 10, hint: "0–2: khó theo dõi · 3–6: dễ hiểu · 7–10: có cấu trúc, điều chỉnh theo người nghe" },
  { key: "mentoring", label: "Hướng dẫn", weight: 20, hint: "0–2: không có góc nhìn hướng dẫn · 3–6: chỉ dẫn chung · 7–10: kế hoạch dạy cụ thể, biết chẩn đoán trình độ" },
  { key: "authenticity", label: "Xác thực và cam kết", weight: 15, hint: "0–2: hồ sơ / vòng 1 không khớp, nghi người khác làm · 3–6: khớp phần lớn · 7–10: khớp hoàn toàn, cam kết rõ" },
];
const BLOCKING: Round2Criterion[] = ["technical", "authenticity"];

/** Cùng công thức với ai-service (round2_rubric.py) để admin thấy điểm tổng + khuyến nghị ngay khi chấm; server tính lại và quyết định. */
export function round2Preview(scores: Partial<Record<Round2Criterion, number>>): { total: number; recommendation: Recommendation; blocked: boolean } | null {
  if (ROUND2_CRITERIA.some((c) => scores[c.key] == null)) return null;
  const s = scores as Round2Scores;
  const total = Math.round(ROUND2_CRITERIA.reduce((sum, c) => sum + (c.weight / 100) * s[c.key], 0) * 100 + 1e-9) / 10;
  const blocked = BLOCKING.some((k) => s[k] <= 2);
  const base: Recommendation = total >= 70 ? "APPROVE" : total < 50 ? "REJECT" : "NEEDS_REVIEW";
  return { total, blocked, recommendation: base === "APPROVE" && blocked ? "NEEDS_REVIEW" : base };
}

const needsReason = (v: number) => v <= 2 || v >= 9;

// ---------------------------------------------------------------- mentor

/** Mentor: chọn khung giờ admin đề xuất, xem giờ đã chốt, vào phòng, đổi giờ (≤ 2 lần, báo trước ≥ 24 giờ). */
export function MentorRound2Card({ state, onChange }: { state: VerificationState; onChange: (s: VerificationState) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Flash>({});
  const [dialog, ask] = useDialog();

  async function run(action: () => Promise<VerificationState>, ok: string) {
    setBusy(true);
    setMsg({});
    try {
      onChange(await action());
      setMsg({ ok });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    const yes = await ask({
      title: "Đổi giờ phỏng vấn?", danger: true, confirmText: "Đổi giờ",
      message: `Khung giờ đã chốt sẽ bị huỷ và quản trị viên đề xuất giờ mới. Bạn đã đổi ${state.rescheduleCount}/${state.rescheduleLimit} lần; đổi muộn hơn 24 giờ trước giờ bắt đầu thì không được.`,
    });
    if (yes) await run(aiApi.rescheduleRound2, "Đã huỷ khung giờ. Quản trị viên sẽ đề xuất giờ mới.");
  }

  if (state.status === "ROUND2_PENDING_SLOTS") {
    return <Alert tone="info" title="Bạn đã qua vòng 1">Quản trị viên sẽ đề xuất các khung giờ phỏng vấn trực tiếp. Bạn sẽ nhận thông báo để chọn một khung giờ.</Alert>;
  }
  if (state.status === "ROUND2_PENDING_CHOICE") {
    return (
      <Card>
        {dialog}
        <CardHeader title="Chọn giờ phỏng vấn vòng 2"
          description={`Phỏng vấn trực tiếp với quản trị viên qua video call, không giới hạn thời lượng. Chọn trước ${formatDateTime(state.choiceDeadline)}.`} />
        <CardBody className="flex flex-col gap-3">
          <FlashAlerts flash={msg} />
          {state.slots.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="font-medium">{formatDateTime(s.startsAt)}</span>
              <Button size="sm" variant="primary" icon={CalendarClock} loading={busy}
                onClick={() => run(() => aiApi.chooseSlot(s.id), "Đã chốt giờ phỏng vấn.")}>Chọn giờ này</Button>
            </div>
          ))}
        </CardBody>
      </Card>
    );
  }
  if (state.status === "ROUND2_SCHEDULED" && state.round2) {
    const r = state.round2;
    return (
      <Card>
        {dialog}
        <CardHeader title="Phỏng vấn vòng 2 đã chốt giờ" description={`${formatDateTime(r.scheduledAt)} · phòng mở từ ${formatDateTime(r.roomOpensAt)}`} />
        <CardBody className="flex flex-col gap-3">
          <FlashAlerts flash={msg} />
          <p className="text-small text-ink-muted">
            Đến giờ, bấm “Vào phòng phỏng vấn” (cần camera và micro). Vắng mặt quá 10 phút sau giờ bắt đầu bị tính một lần vắng; vắng {state.maxAttempts} lần thì đợt xác thực bị đóng.
            Đã đổi giờ {state.rescheduleCount}/{state.rescheduleLimit} lần.
          </p>
          {!r.canReschedule && (
            <Alert tone="info">
              {r.rescheduleBlockedReason === "RESCHEDULE_LIMIT" ? "Bạn đã đổi giờ đủ số lần cho phép." : "Còn dưới 24 giờ nên không đổi giờ được nữa."}
            </Alert>
          )}
        </CardBody>
        <CardFooter>
          <Link className="btn btn-primary" href="/interview/room"><DoorOpen aria-hidden="true" className="size-4" /> Vào phòng phỏng vấn</Link>
          <Button disabled={!r.canReschedule} loading={busy} onClick={reschedule}>Đổi giờ</Button>
        </CardFooter>
      </Card>
    );
  }
  return null;
}

// ---------------------------------------------------------------- admin

function toIso(local: string): string | null {
  const d = local ? new Date(local) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/** Admin: đề xuất khung giờ (mặc định 3, chỉ có giờ bắt đầu). */
function ProposeSlots({ app, onChange }: { app: VerificationApplication; onChange: (a: VerificationApplication) => void }) {
  const [values, setValues] = useState(["", "", ""]);
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);
  const pending = app.status === "ROUND2_PENDING_CHOICE";
  const deadlinePassed = pending && app.choiceDeadline != null && new Date(app.choiceDeadline).getTime() < Date.now();

  async function submit() {
    const iso = values.map(toIso).filter((x): x is string => x != null);
    if (iso.length === 0) { setMsg({ error: "Nhập ít nhất một khung giờ." }); return; }
    setBusy(true);
    setMsg({});
    try {
      const updated = await aiApi.proposeSlots(app.id, iso);
      onChange(updated);
      setMsg({ ok: `Đã gửi ${iso.length} khung giờ cho mentor.`, ...(updated.warnings.length ? { error: updated.warnings.join(" ") } : {}) });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={pending ? "Đang chờ mentor chọn giờ" : "Đề xuất khung giờ phỏng vấn"}
        description={pending ? `Hạn chọn ${formatDateTime(app.choiceDeadline)}${deadlinePassed ? " — đã quá hạn, có thể đề xuất lại" : ""}.` : "Chỉ có giờ bắt đầu, buổi không giới hạn thời lượng. Tối đa 3 khung giờ."} />
      <CardBody className="flex flex-col gap-3">
        <FlashAlerts flash={msg} />
        {app.slots.length > 0 && (
          <ul className="flex flex-col gap-1 text-small">
            {app.slots.map((s) => <li key={s.id}>{formatDateTime(s.startsAt)} <StatusBadge status={s.status} labels={{ PROPOSED: "Đã đề xuất", CHOSEN: "Đã chọn", EXPIRED: "Hết hiệu lực" }} /></li>)}
          </ul>
        )}
        {(!pending || deadlinePassed) && values.map((v, i) => (
          <Field key={i} label={`Khung giờ ${i + 1}`} id={`slot-${i}`}>
            <Input id={`slot-${i}`} type="datetime-local" value={v} onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
      </CardBody>
      {(!pending || deadlinePassed) && <CardFooter><Button variant="primary" icon={CalendarClock} loading={busy} onClick={submit}>Gửi đề xuất cho mentor</Button></CardFooter>}
    </Card>
  );
}

function ScoreSheet({ app, onChange }: { app: VerificationApplication; onChange: (a: VerificationApplication) => void }) {
  const [scores, setScores] = useState<Partial<Record<Round2Criterion, number>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);
  const preview = round2Preview(scores);

  async function decide(decision: Round2Decision) {
    setMsg({});
    if (decision !== "RESCHEDULE") {
      if (!preview) { setMsg({ error: "Cần chấm đủ 5 tiêu chí." }); return; }
      const missing = ROUND2_CRITERIA.filter((c) => needsReason(scores[c.key]!) && (notes[c.key] ?? "").trim().length < 10);
      if (missing.length) { setMsg({ error: `Tiêu chí chấm ≤ 2 hoặc ≥ 9 cần lý do (ít nhất 10 ký tự): ${missing.map((c) => c.label).join(", ")}.` }); return; }
    }
    setBusy(true);
    try {
      onChange(await aiApi.round2Decision(app.id, decision, decision === "RESCHEDULE" ? null : (scores as Round2Scores), notes, note));
      setMsg({ ok: decision === "APPROVE" ? "Đã kích hoạt mentor." : decision === "REJECT" ? "Đã từ chối mentor, mentor chờ 15 ngày." : "Đã dời buổi phỏng vấn (không tính vào lần của mentor)." });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Phiếu chấm vòng 2" description="Chấm sau buổi phỏng vấn: 5 tiêu chí thang 0–10, cùng thang và cùng ngưỡng khuyến nghị với vòng 1. Phiếu không sửa được sau khi quyết định." />
      <CardBody className="flex flex-col gap-4">
        <FlashAlerts flash={msg} />
        {ROUND2_CRITERIA.map((c) => {
          const v = scores[c.key];
          return (
            <div key={c.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
              <div>
                <div className="font-medium">{c.label} <span className="text-ink-subtle">({c.weight}%)</span></div>
                <div className="text-small text-ink-muted">{c.hint}</div>
                {v != null && needsReason(v) && (
                  <Input aria-label={`Lý do ${c.label}`} className="mt-2" placeholder="Lý do (bắt buộc khi chấm ≤ 2 hoặc ≥ 9)" value={notes[c.key] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [c.key]: e.target.value })} maxLength={500} />
                )}
              </div>
              <Input aria-label={`Điểm ${c.label}`} type="number" min={0} max={10} step={0.5} value={v ?? ""}
                onChange={(e) => setScores({ ...scores, [c.key]: e.target.value === "" ? undefined : Math.max(0, Math.min(10, Number(e.target.value))) })} />
            </div>
          );
        })}
        {preview && (
          <Alert tone={preview.recommendation === "APPROVE" ? "success" : preview.recommendation === "REJECT" ? "danger" : "warning"}
            title={`Điểm tổng ${preview.total.toFixed(1)}/100 · khuyến nghị ${preview.recommendation === "APPROVE" ? "duyệt" : preview.recommendation === "REJECT" ? "không duyệt" : "cần xem xét"}`}>
            {preview.blocked && "Điều kiện chặn: kỹ thuật hoặc xác thực ≤ 2 nên khuyến nghị tối đa là “cần xem xét”. "}
            Quyết định ngược khuyến nghị cần ghi chú tổng (ít nhất 10 ký tự).
          </Alert>
        )}
        <Field label="Ghi chú tổng" id="r2-note"><Textarea id="r2-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></Field>
      </CardBody>
      <CardFooter>
        <Button icon={RotateCcw} loading={busy} onClick={() => decide("RESCHEDULE")}>Dời buổi (không tính mentor)</Button>
        <Button variant="danger" icon={X} loading={busy} onClick={() => decide("REJECT")}>Từ chối</Button>
        <Button variant="primary" icon={Check} loading={busy} onClick={() => decide("APPROVE")}>Duyệt và kích hoạt</Button>
      </CardFooter>
    </Card>
  );
}

function InterviewHistory({ items }: { items: Round2Interview[] }) {
  const done = items.filter((i) => i.status !== "SCHEDULED");
  if (done.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Lịch sử vòng 2" />
      <CardBody className="flex flex-col gap-4">
        {done.map((i) => (
          <div key={i.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{formatDateTime(i.scheduledAt)}</span>
              <StatusBadge status={i.status} labels={{ COMPLETED: "Đã chấm", MENTOR_NO_SHOW: "Mentor vắng", RESCHEDULED: "Đã dời" }} />
              {i.totalScore != null && <Badge>{i.totalScore.toFixed(1)}/100</Badge>}
              {i.recommendation && <StatusBadge status={i.recommendation} />}
              {i.blocked && <Badge tone="warning">Điều kiện chặn</Badge>}
            </div>
            {i.scores && (
              <Table>
                <thead><tr><th>Tiêu chí</th><th className="num">Admin</th><th className="num">AI vòng 1</th><th>Lý do</th></tr></thead>
                <tbody>
                  {ROUND2_CRITERIA.map((c) => {
                    const cmp = i.comparison.find((x) => x.criterion === c.key);
                    return (
                      <tr key={c.key}>
                        <td>{c.label}</td><td className="num">{i.scores![c.key]}</td>
                        <td className="num">{cmp ? <>{cmp.ai.toFixed(1)}{cmp.large && <> <Badge tone="warning" title="Chênh từ 4 điểm trở lên">lệch lớn</Badge></>}</> : "—"}</td>
                        <td className="text-small text-ink-muted">{i.scoreNotes?.[c.key] ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            {i.note && <p className="text-small text-ink-muted">Ghi chú: {i.note}</p>}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/** Admin: toàn bộ thao tác vòng 2 trên trang chi tiết đợt. */
export function AdminRound2Section({ app, onChange }: { app: VerificationApplication; onChange: (a: VerificationApplication) => void }) {
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);
  const scheduled = app.round2Interviews.find((i) => i.status === "SCHEDULED");

  async function absent() {
    setBusy(true);
    setMsg({});
    try {
      onChange(await aiApi.mentorAbsent(app.id));
      setMsg({ ok: "Đã ghi nhận mentor vắng." });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const slotsStage = app.status === "ROUND2_PENDING_SLOTS" || app.status === "ROUND2_PENDING_CHOICE";
  if (!slotsStage && app.status !== "ROUND2_SCHEDULED" && app.round2Interviews.length === 0) return null;
  return (
    <>
      <FlashAlerts flash={msg} />
      {slotsStage && <ProposeSlots app={app} onChange={onChange} />}
      {app.status === "ROUND2_SCHEDULED" && scheduled && (
        <>
          <Card>
            <CardHeader title="Phỏng vấn vòng 2" description={`${formatDateTime(scheduled.scheduledAt)} · mentor đổi giờ ${app.rescheduleCount} lần · vắng ${app.noShowCount} lần`} />
            <CardBody>
              <DescriptionList items={[
                ["Mentor vào phòng", scheduled.mentorJoinedAt ? formatDateTime(scheduled.mentorJoinedAt) : "Chưa vào"],
                ["Bạn vào phòng", scheduled.adminJoinedAt ? formatDateTime(scheduled.adminJoinedAt) : "Chưa vào"],
              ]} />
            </CardBody>
            <CardFooter>
              <Link className="btn btn-primary" href={`/admin/verification/${app.id}/room`}><Video aria-hidden="true" className="size-4" /> Vào phòng phỏng vấn</Link>
              <Button icon={UserX} loading={busy} onClick={absent}>Báo mentor vắng</Button>
            </CardFooter>
          </Card>
          <ScoreSheet app={app} onChange={onChange} />
        </>
      )}
      <InterviewHistory items={app.round2Interviews} />
    </>
  );
}
