"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AudioLines, Mic, PhoneOff } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, Input, Loading, PageHeader, Select, StatusBadge, Table } from "@/components/ui";
import { MockInterviewCta, PRACTICE_RUBRIC, PracticeResultView, practiceTitle } from "@/features/ai/PracticeResult";
import { TopicPlan, VOICE_DISABLED, VoiceCallCard, VoiceConsent } from "@/features/ai/VoiceViews";
import { aiApi } from "@/features/ai/api";
import { useRealtimeVoice } from "@/features/ai/useRealtimeVoice";
import { MOCK_LEVELS, MOCK_LEVEL_LABELS, MOCK_TYPES, MOCK_TYPE_LABELS } from "@/features/mentoring/mockLabels";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Practice, PracticeEligibility, PracticeLevel, PracticeType, StartPracticeInput, VoiceSession, VoiceTranscriptItem } from "@/types";

const STATUS: Record<Practice["status"], string> = { IN_PROGRESS: "Đang diễn ra", COMPLETED: "Hoàn thành", ABANDONED: "Bỏ dở (quá 30 phút)" };

/** Intake trước buổi luyện: dạng phỏng vấn, cấp độ, vị trí, công ty (tuỳ chọn), đồng ý OpenAI xử lý âm thanh. */
function IntakeForm({ eligibility, busy, onStart }: { eligibility: PracticeEligibility; busy: boolean; onStart: (input: StartPracticeInput) => void }) {
  const [interviewType, setType] = useState<PracticeType>("BACKEND");
  const [level, setLevel] = useState<PracticeLevel>("FRESHER");
  const [targetRole, setRole] = useState("");
  const [targetCompany, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const role = targetRole.trim();
  const voiceOff = !eligibility.voiceAvailable;

  function submit(e: FormEvent) {
    e.preventDefault();
    onStart({ interviewType, level, targetRole: role, targetCompany: targetCompany.trim() || null, consentExternalAi: consent });
  }

  return (
    <Card className="max-w-[820px]">
      <form onSubmit={submit}>
        <CardHeader title="Buổi luyện miễn phí của bạn" description={`Bạn có ${eligibility.freeLimit} buổi luyện phỏng vấn với AI miễn phí. Kết quả và góp ý hiện ngay sau buổi.`} />
        <CardBody className="flex flex-col gap-5">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Người phỏng vấn AI đóng vai nhà tuyển dụng cho đúng vị trí và cấp độ bạn chọn, hỏi khoảng <strong>4 câu</strong> trong <strong>15 phút</strong> và hỏi đào sâu như phỏng vấn thật.</li>
            <li>Mỗi câu trả lời được chấm 4 tiêu chí: {PRACTICE_RUBRIC.map((c) => `${c.label} (${c.weight}%)`).join(", ")}. Câu hỏi hành vi chấm theo khung STAR.</li>
            <li>Làm trong <strong>một lần</strong>: rớt mạng thì kết nối lại được trong 30 phút; quá 30 phút chưa kết thúc thì buổi bị huỷ và vẫn tính là lượt miễn phí.</li>
          </ul>
          {voiceOff && <Alert tone="warning">{VOICE_DISABLED}. Vui lòng quay lại sau.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dạng phỏng vấn" id="practice-type" required>
              <Select id="practice-type" value={interviewType} onChange={(e) => setType(e.target.value as PracticeType)}>
                {MOCK_TYPES.map((t) => <option key={t} value={t}>{MOCK_TYPE_LABELS[t]}</option>)}
              </Select>
            </Field>
            <Field label="Cấp độ" id="practice-level" required>
              <Select id="practice-level" value={level} onChange={(e) => setLevel(e.target.value as PracticeLevel)}>
                {MOCK_LEVELS.map((l) => <option key={l} value={l}>{MOCK_LEVEL_LABELS[l]}</option>)}
              </Select>
            </Field>
            <Field label="Vị trí ứng tuyển" id="practice-role" required hint="2–120 ký tự, ví dụ Backend Developer (Java)">
              <Input id="practice-role" value={targetRole} onChange={(e) => setRole(e.target.value)} maxLength={120} required />
            </Field>
            <Field label="Công ty (tuỳ chọn)" id="practice-company">
              <Input id="practice-company" value={targetCompany} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
            </Field>
          </div>
          <p className="text-small text-ink-muted">
            AI soạn câu hỏi riêng cho bạn từ vị trí, cấp độ, mục tiêu trong hồ sơ và CV đã xác nhận (chỉ khi bạn đã đồng ý gửi CV tới AI bên ngoài).
          </p>
          <VoiceConsent checked={consent} onChange={setConsent} disabled={voiceOff} />
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" icon={Mic} loading={busy} disabled={voiceOff || !consent || role.length < 2}>
            {busy ? "AI đang soạn câu hỏi cho bạn…" : "Bắt đầu luyện phỏng vấn"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function History({ items }: { items: Practice[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Lịch sử luyện phỏng vấn" />
      <Table>
        <thead><tr><th>Bắt đầu</th><th>Buổi</th><th>Trạng thái</th><th className="num">Điểm</th><th></th></tr></thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{formatDateTime(p.createdAt)}</td>
              <td>{practiceTitle(p)}</td>
              <td><StatusBadge status={p.status} labels={STATUS} /></td>
              <td className="num">{p.overallScore ?? "—"}</td>
              <td>{p.status === "COMPLETED" && <Link href={`/practice-interview/${p.id}`}>Xem kết quả</Link>}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/** FR-10.x — "Luyện phỏng vấn với AI": mentee nói chuyện với người phỏng vấn AI, nhận kết quả ngay sau buổi. */
function PracticeInterview() {
  const [eligibility, setEligibility] = useState<PracticeEligibility | null>(null);
  const [history, setHistory] = useState<Practice[] | null>(null);
  const [current, setCurrent] = useState<Practice | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [done, setDone] = useState<Practice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = useRealtimeVoice(submit);

  function reload() {
    aiApi.practiceEligibility().then(setEligibility).catch((e) => setError(errorMessage(e)));
    aiApi.myPractices().then((list) => {
      setHistory(list);
      setCurrent((c) => c ?? list.find((p) => p.status === "IN_PROGRESS") ?? null);
    }).catch(() => setHistory([]));
  }

  useEffect(reload, []);

  async function start(input: StartPracticeInput) {
    setBusy(true);
    setError("");
    try {
      const res = await aiApi.startPractice(input);
      if (res.practice.id !== current?.id) call.reset();
      setCurrent(res.practice);
      setSession(res.voice);
      if (!res.voice) setError(`${VOICE_DISABLED} trên máy chủ này.`);
      else await call.connect(res.voice);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.code === "PRACTICE_FREE_USED") reload();
    } finally {
      setBusy(false);
    }
  }

  /** Kết nối lại buổi đang dở (giữ intake cũ — server trả lại đúng buổi đó với client secret mới). */
  function resume(p: Practice) {
    return start({ interviewType: p.interviewType, level: p.level, targetRole: p.targetRole, targetCompany: p.targetCompany, consentExternalAi: true });
  }

  async function submit(items: VoiceTranscriptItem[]) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const result = await aiApi.completePractice(current.id, items);
      setDone(result);
      setCurrent(null);
      setSession(null);
      reload();
    } catch (e) {
      setError(errorMessage(e));
      call.setPhase("dropped"); // ví dụ EMPTY_TRANSCRIPT: kết nối lại để trả lời tiếp
    } finally {
      setBusy(false);
    }
  }

  if (!eligibility || history === null) return <Loading />;
  const live = current?.status === "IN_PROGRESS";

  return (
    <>
      <PageHeader title="Luyện phỏng vấn với AI"
        description="Luyện nói như phỏng vấn thật với người phỏng vấn AI cho đúng vị trí bạn nhắm tới; nhận điểm, góp ý từng câu và báo cáo cách nói ngay sau buổi." />
      <Alert className="mb-6">{error}</Alert>

      <div className="flex flex-col gap-6">
        {done && <PracticeResultView practice={done} />}

        {!done && live && current && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <VoiceCallCard entries={call.entries} phase={call.phase} topics={session?.topics ?? current.topics} error={call.error}
              footer={
                call.phase === "live" ? <Button variant="danger" icon={PhoneOff} onClick={call.finish}>Kết thúc và xem kết quả</Button>
                  : call.phase === "connecting" ? <Button loading disabled>Đang kết nối…</Button>
                  : call.phase === "ended" || busy ? <Button loading disabled>Đang chấm điểm…</Button>
                  : (
                    <>
                      {current.resumeDeadline && <span className="text-small text-ink-muted">Kết nối lại được tới {formatDateTime(current.resumeDeadline)}.</span>}
                      <Button variant="primary" icon={Mic} className="ml-auto" onClick={() => resume(current)} disabled={!eligibility.voiceAvailable}>
                        {call.entries.length ? "Kết nối lại" : "Bắt đầu nói chuyện"}
                      </Button>
                    </>
                  )
              } />
            <div className="flex min-w-0 flex-col gap-6">
              <TopicPlan topics={session?.topics ?? current.topics} note={practiceTitle(current)} />
            </div>
          </div>
        )}

        {!done && !live && eligibility.canStart && <IntakeForm eligibility={eligibility} busy={busy} onStart={start} />}

        {!done && !live && !eligibility.canStart && (
          history.length ? <MockInterviewCta title="Bạn đã dùng buổi luyện miễn phí với AI" />
            : <EmptyState icon={AudioLines} title="Chưa thể luyện phỏng vấn">Vui lòng quay lại sau.</EmptyState>
        )}

        <History items={history} />
      </div>
    </>
  );
}

export default function PracticeInterviewPage() {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <PracticeInterview />
    </RequireAuth>
  );
}
