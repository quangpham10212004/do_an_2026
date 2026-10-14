"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Checkbox, DescriptionList, Field, FlashAlerts, Input, Loading, PageHeader, Progress, Radio, Textarea, type Flash } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import {
  MOCK_DIMENSIONS, MOCK_LEVEL_LABELS, MOCK_TYPE_LABELS, MOCK_VERDICTS, MOCK_VERDICT_LABELS, MOCK_VERDICT_TONE,
  bandOf, type MockDimensionKey,
} from "@/features/mentoring/mockLabels";
import { formatDate, formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MockInterviewView, MockVerdict, MockWeights, ScorecardView } from "@/types";

type Scores = Record<MockDimensionKey, number>;

interface FormState {
  scores: Scores;
  liveCodingOn: boolean;
  liveCoding: number;
  verdict: MockVerdict | "";
  fixes: [string, string, string];
  privateNote: string;
}

const FIX_MIN = 5;
const FIX_MAX = 300;

function initialForm(card: ScorecardView | null): FormState {
  if (!card) {
    return { scores: { technical: 5, problemSolving: 5, depth: 5, communication: 5 }, liveCodingOn: false, liveCoding: 5,
      verdict: "", fixes: ["", "", ""], privateNote: "" };
  }
  return {
    scores: { technical: card.technical, problemSolving: card.problemSolving, depth: card.depth, communication: card.communication },
    liveCodingOn: card.liveCoding != null, liveCoding: card.liveCoding ?? 5, verdict: card.verdict,
    fixes: [card.fixes[0] ?? "", card.fixes[1] ?? "", card.fixes[2] ?? ""], privateNote: card.privateNote ?? "",
  };
}

/** Điểm tổng = trung bình có trọng số (giống MockInterviewRules.overall ở server). */
function overall(scores: Scores, w: MockWeights): number {
  return Math.round((w.technical * scores.technical + w.problemSolving * scores.problemSolving + w.depth * scores.depth
    + w.communication * scores.communication)) / 100;
}

/** US-58 — trang phỏng vấn thử của một phiên: intake, phiếu đánh giá (mentor điền / mentee xem). */
function MockInterview({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<MockInterviewView | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(initialForm(null));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>({});

  useEffect(() => {
    mentoringApi.mockInterview(sessionId)
      .then((v) => { setView(v); setForm(initialForm(v.scorecard)); })
      .catch((e) => { setFlash({ error: errorMessage(e) }); setView(null); });
  }, [sessionId]);

  const weights = view?.intake ? view.weights[view.intake.interviewType] : null;
  const preview = useMemo(() => (weights ? overall(form.scores, weights) : 0), [form.scores, weights]);

  if (view === undefined) return <Loading />;
  if (!view) return <FlashAlerts flash={flash} />;

  const fixes = form.fixes.map((f) => f.trim());
  const fixesValid = fixes.every((f) => f.length >= FIX_MIN && f.length <= FIX_MAX)
    && new Set(fixes.map((f) => f.toLowerCase())).size === 3;
  const formValid = !!form.verdict && fixesValid;
  const showForm = view.canScore && (!view.scorecard || editing);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!formValid || !form.verdict) return;
    setBusy(true);
    setFlash({});
    try {
      const first = !view?.scorecard;
      const v = await mentoringApi.submitScorecard(sessionId, {
        ...form.scores,
        liveCoding: form.liveCodingOn ? form.liveCoding : null,
        verdict: form.verdict,
        fixes,
        privateNote: form.privateNote.trim() || undefined,
      });
      setView(v);
      setForm(initialForm(v.scorecard));
      setEditing(false);
      setFlash({ ok: first ? "Đã gửi phiếu đánh giá. 3 điểm cần cải thiện đã thành việc cần làm của mentee." : "Đã cập nhật phiếu đánh giá." });
    } catch (err) {
      setFlash({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const intake = view.intake;
  const ended = new Date(view.endsAt).getTime() <= Date.now();

  return (
    <>
      <PageHeader title="Phỏng vấn thử"
        description={intake ? `${MOCK_TYPE_LABELS[intake.interviewType]} · ${MOCK_LEVEL_LABELS[intake.level]} · ${formatDateTime(view.scheduledAt)}` : formatDateTime(view.scheduledAt)}
        back={{ href: "/mentoring/sessions", label: "Phiên học" }}
        actions={<ButtonLink href={`/mentoring/sessions/${sessionId}/notes`}>Ghi chú phiên</ButtonLink>} />
      <FlashAlerts flash={flash} className="mb-4" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {view.scorecard && !showForm && (
            <ScorecardCard card={view.scorecard} weights={weights}
              action={view.canScore ? <Button size="sm" onClick={() => setEditing(true)}>Sửa phiếu</Button> : undefined} />
          )}
          {!view.scorecard && !view.canScore && (
            view.scorecardMissing
              ? <Alert tone="warning" title="Mentor chưa gửi phiếu đúng hạn">Phiếu đánh giá lẽ ra có trước {formatDateTime(view.scorecardDueAt)}. Bạn có thể nhắn mentor trong mục Tin nhắn.</Alert>
              : view.viewerRole === "MENTOR"
                ? <Alert tone="info" title="Chưa điền được phiếu">{ended ? "Phiên không diễn ra nên không có phiếu đánh giá." : `Bạn điền phiếu sau khi phiên kết thúc (${formatDateTime(view.endsAt)}). Hạn: 48 giờ sau phiên.`}</Alert>
                : <Alert tone="info" title="Chưa có phiếu đánh giá">{ended ? `Mentor sẽ gửi phiếu trước ${formatDateTime(view.scorecardDueAt)}.` : "Phiếu đánh giá có sau buổi phỏng vấn thử, chậm nhất 48 giờ sau phiên."}</Alert>
          )}
          {view.canScore && view.scorecardMissing && !view.scorecard && (
            <Alert tone="warning" title="Phiếu đã quá hạn 48 giờ">
              Phiên đang bị đánh dấu thiếu phiếu đánh giá (ảnh hưởng thứ hạng phỏng vấn thử). Gửi phiếu ngay để gỡ dấu, chậm nhất 7 ngày sau phiên.
            </Alert>
          )}
          {showForm && weights && (
            <form onSubmit={submit}>
              <Card>
                <CardHeader title={view.scorecard ? "Sửa phiếu đánh giá" : "Phiếu đánh giá"}
                  description={`Hạn gửi: ${formatDateTime(view.scorecardDueAt)}. Điểm 0–10 theo mô tả mức dưới mỗi tiêu chí.`} />
                <CardBody className="flex flex-col gap-5">
                  {MOCK_DIMENSIONS.map((d) => (
                    <Field key={d.key} label={`${d.label} · trọng số ${weights[d.key]}%`} id={`score-${d.key}`}
                      hint={`${form.scores[d.key]}/10 — ${bandOf(form.scores[d.key], d.bands)}`}>
                      <div className="flex items-center gap-3">
                        <input id={`score-${d.key}`} type="range" min={0} max={10} step={1} className="w-full accent-[var(--accent)]"
                          value={form.scores[d.key]} aria-valuetext={`${form.scores[d.key]} trên 10`}
                          onChange={(e) => setForm({ ...form, scores: { ...form.scores, [d.key]: Number(e.target.value) } })} />
                        <span className="w-10 text-right font-mono tabular">{form.scores[d.key]}</span>
                      </div>
                    </Field>
                  ))}
                  <div className="flex flex-col gap-2">
                    <Checkbox label="Buổi phỏng vấn có bài code trực tiếp (live coding)" checked={form.liveCodingOn}
                      onChange={(e) => setForm({ ...form, liveCodingOn: e.target.checked })} />
                    {form.liveCodingOn && (
                      <div className="flex items-center gap-3">
                        <input type="range" min={0} max={10} step={1} className="w-full accent-[var(--accent)]" aria-label="Điểm live coding"
                          value={form.liveCoding} onChange={(e) => setForm({ ...form, liveCoding: Number(e.target.value) })} />
                        <span className="w-10 text-right font-mono tabular">{form.liveCoding}</span>
                      </div>
                    )}
                  </div>
                  <div className="well flex items-baseline justify-between">
                    <span className="text-ink-muted">Điểm tổng (không tính live coding)</span>
                    <span className="font-mono text-title-2 font-medium tabular">{preview.toFixed(2)}/10</span>
                  </div>
                  <Field label="Kết luận" id="verdict" required hint="Chỉ mentor đưa ra kết luận tuyển / không tuyển.">
                    <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup" aria-label="Kết luận">
                      {MOCK_VERDICTS.map((v) => (
                        <Radio key={v} name="verdict" label={MOCK_VERDICT_LABELS[v]} checked={form.verdict === v}
                          onChange={() => setForm({ ...form, verdict: v })} />
                      ))}
                    </div>
                  </Field>
                  {[0, 1, 2].map((i) => {
                    const t = fixes[i];
                    return (
                      <Field key={i} label={`Điểm cần cải thiện ${i + 1}`} id={`fix-${i}`} required
                        error={t.length > 0 && t.length < FIX_MIN ? `Tối thiểu ${FIX_MIN} ký tự.` : undefined}
                        hint={i === 0 ? "Ba điểm cụ thể nhất mentee nên sửa trước buổi phỏng vấn thật; sẽ thành việc cần làm của mentee." : undefined}>
                        <Input id={`fix-${i}`} value={form.fixes[i]} maxLength={FIX_MAX} required
                          placeholder={["Nói rõ độ phức tạp thuật toán trước khi code", "Hỏi lại yêu cầu và ràng buộc trước khi trả lời", "Kể ví dụ dự án theo cấu trúc STAR"][i]}
                          onChange={(e) => {
                            const next = [...form.fixes] as FormState["fixes"];
                            next[i] = e.target.value;
                            setForm({ ...form, fixes: next });
                          }} />
                      </Field>
                    );
                  })}
                  {fixes.every((f) => f.length >= FIX_MIN) && !fixesValid && <Alert>Ba điểm cần cải thiện phải khác nhau.</Alert>}
                  <Field label="Lời nhắn riêng cho mentee" id="note" hint="Không bắt buộc. Chỉ mentee thấy.">
                    <Textarea id="note" value={form.privateNote} maxLength={2000} rows={3}
                      onChange={(e) => setForm({ ...form, privateNote: e.target.value })} />
                  </Field>
                  <div className="flex flex-wrap justify-end gap-2">
                    {view.scorecard && <Button type="button" variant="ghost" onClick={() => { setEditing(false); setForm(initialForm(view.scorecard)); }}>Huỷ</Button>}
                    <Button type="submit" variant="primary" loading={busy} disabled={!formValid}>{view.scorecard ? "Lưu thay đổi" : "Gửi phiếu đánh giá"}</Button>
                  </div>
                </CardBody>
              </Card>
            </form>
          )}
        </div>
        {intake && (
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="Thông tin buổi phỏng vấn" />
            <CardBody>
              <DescriptionList items={[
                ["Dạng", MOCK_TYPE_LABELS[intake.interviewType]],
                ["Cấp độ", MOCK_LEVEL_LABELS[intake.level]],
                ["Vị trí", intake.targetRole],
                ...(intake.targetCompany ? [["Công ty", intake.targetCompany] as [string, string]] : []),
                ...(intake.interviewDate ? [["Phỏng vấn thật", formatDate(intake.interviewDate)] as [string, string]] : []),
                ...(intake.jdUrl ? [["JD", <a key="jd" href={intake.jdUrl} target="_blank" rel="noreferrer noopener">Mở mô tả công việc</a>] as [string, ReactNode]] : []),
              ]} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function ScorecardCard({ card, weights, action }: { card: ScorecardView; weights: MockWeights | null; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title="Kết quả phỏng vấn thử"
        description={`${card.mentorName ?? "Mentor"} · cập nhật ${formatDateTime(card.updatedAt)}`} actions={action} />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Điểm tổng</div>
            <div className="font-mono text-title-1 font-medium tabular">{Number(card.overall).toFixed(2)}<span className="text-ink-muted">/10</span></div>
          </div>
          <Badge tone={MOCK_VERDICT_TONE[card.verdict]}>{MOCK_VERDICT_LABELS[card.verdict]}</Badge>
        </div>
        <ul className="flex flex-col gap-3">
          {MOCK_DIMENSIONS.map((d) => {
            const v = card[d.key];
            return (
              <li key={d.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{d.label}{weights && <span className="text-small text-ink-muted"> · {weights[d.key]}%</span>}</span>
                  <span className="font-mono tabular">{v}/10</span>
                </div>
                <Progress value={v * 10} label={`${d.label}: ${v}/10`} />
                <span className="text-small text-ink-muted">{bandOf(v, d.bands)}</span>
              </li>
            );
          })}
          {card.liveCoding != null && (
            <li className="flex items-baseline justify-between gap-2">
              <span className="font-medium">Live coding <span className="text-small text-ink-muted">(không tính vào điểm tổng)</span></span>
              <span className="font-mono tabular">{card.liveCoding}/10</span>
            </li>
          )}
        </ul>
        <div>
          <div className="eyebrow mb-2">3 điểm cần cải thiện</div>
          <ol className="list-decimal space-y-1 pl-5">{card.fixes.map((f) => <li key={f}>{f}</li>)}</ol>
          <p className="mt-2 text-small text-ink-muted">Đã thêm vào việc cần làm của mentee ở trang ghi chú phiên.</p>
        </div>
        {card.privateNote && (
          <div className="well">
            <div className="eyebrow mb-1">Lời nhắn của mentor</div>
            <p className="whitespace-pre-line">{card.privateNote}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function MockInterviewPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["MENTEE", "MENTOR", "ADMIN"]}>
      <MockInterview sessionId={params.id} />
    </RequireAuth>
  );
}
