"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Mic, PhoneOff, Timer } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Checkbox, DescriptionList, Loading, PageHeader, Segmented, StatusBadge, Table, Textarea } from "@/components/ui";
import { AssessmentCard, InterviewTranscript, RUBRIC } from "@/features/ai/InterviewViews";
import { TopicPlan, VOICE_DISABLED, VoiceCallCard, VoiceConsent } from "@/features/ai/VoiceViews";
import { aiApi } from "@/features/ai/api";
import { useRealtimeVoice } from "@/features/ai/useRealtimeVoice";
import { STATUS_LABELS, formatDateTime } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { Interview, InterviewEligibility, InterviewMode, VoiceSession, VoiceTranscriptItem } from "@/types";

/** US-22 (PRD-AIV-1, PRD-AIV-4): màn hình giới thiệu trước khi bắt đầu + quy tắc số lần phỏng vấn. */
function IntroCard({ eligibility, busy, onStart }: { eligibility: InterviewEligibility | null; busy: boolean; onStart: (mode: InterviewMode, consent: boolean) => void }) {
  const [ack, setAck] = useState(false);
  // FR-7.7 — chat hoặc giọng nói: cùng số câu hỏi, rubric, quy tắc số lần và duyệt của admin
  const [mode, setMode] = useState<InterviewMode>("CHAT");
  const [consent, setConsent] = useState(false);
  const voice = mode === "VOICE";
  const voiceOff = eligibility != null && !eligibility.voiceAvailable;
  const blocked = eligibility != null && !eligibility.canStart;
  const max = eligibility?.maxAttempts ?? 3;
  return (
    <Card className="max-w-[820px]">
      <CardHeader title="Trước khi bắt đầu" description="Đọc kỹ cách chấm điểm và quy tắc số lần phỏng vấn." />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Segmented<InterviewMode> value={mode} onChange={setMode}
            options={[{ id: "CHAT", label: "Trả lời bằng chữ" }, { id: "VOICE", label: "Nói chuyện bằng giọng nói" }]} />
          {voice && (
            <p className="text-small text-ink-muted">
              Bạn trò chuyện trực tiếp với người phỏng vấn AI qua micro. Buổi giọng nói làm trong <strong>một lần</strong>: rớt mạng thì kết nối lại được
              trong 30 phút; quá 30 phút chưa kết thúc thì buổi bị huỷ và tính là một lần. Cần trình duyệt có micro (Chrome, Edge, Safari mới).
            </p>
          )}
          {voice && voiceOff && <Alert tone="warning">{VOICE_DISABLED}. Hãy chọn trả lời bằng chữ.</Alert>}
        </div>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {voice
            ? <li>Gồm khoảng <strong>4 chủ đề</strong>, khoảng <strong>15 phút</strong>. Người phỏng vấn hỏi đào sâu khi câu trả lời còn chung chung.</li>
            : <li>Gồm <strong>{eligibility?.questionCount ?? 5} câu hỏi</strong>, khoảng <strong>15–20 phút</strong>. Câu sau được điều chỉnh theo câu trả lời trước.</li>}
          <li>Mỗi câu trả lời được chấm theo 4 tiêu chí, thang 0–10:</li>
        </ul>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <thead><tr><th>Tiêu chí</th><th className="num">Trọng số</th><th>Mức cao (7–10)</th></tr></thead>
            <tbody>
              {RUBRIC.map((c) => (
                <tr key={c.key}><td>{c.label}</td><td className="num">{c.weight}%</td><td className="text-small text-ink-muted">{c.bands[2]}</td></tr>
              ))}
            </tbody>
          </Table>
        </div>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Kết quả AI chỉ mang tính hỗ trợ. <strong>Quản trị viên quyết định cuối cùng</strong> trước khi kích hoạt tài khoản.</li>
          <li>Tối đa {max} lần phỏng vấn. Bị từ chối cần chờ 7 ngày mới được làm lại; bị từ chối {max} lần thì cần quản trị viên mở khoá.</li>
        </ul>
        {eligibility && (
          <p className="text-small">
            Đã dùng <strong className="tabular">{eligibility.attemptsUsed}/{eligibility.maxAttempts}</strong> lần, còn lại <strong className="tabular">{eligibility.attemptsLeft}</strong> lần.
          </p>
        )}
        {eligibility?.reason === "COOLDOWN" && <Alert tone="info">Bạn có thể phỏng vấn lại từ {formatDateTime(eligibility.cooldownUntil)}.</Alert>}
        {eligibility?.reason === "LOCKED" && <Alert>Bạn đã bị từ chối {eligibility.maxAttempts} lần. Liên hệ quản trị viên để được mở khoá.</Alert>}
        <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={blocked} label="Tôi tự trả lời, không có sự trợ giúp từ bên ngoài" />
        {voice && <VoiceConsent checked={consent} onChange={setConsent} disabled={blocked || voiceOff} />}
      </CardBody>
      <CardFooter>
        <Button variant="primary" icon={voice ? Mic : undefined} onClick={() => onStart(mode, consent)} loading={busy}
          disabled={!ack || blocked || (voice && (!consent || voiceOff))}>
          {busy ? "Đang chuẩn bị câu hỏi…" : "Bắt đầu phỏng vấn"}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** US-43 (PRD-AIV-2) — đồng hồ gợi ý mỗi câu (chỉ hiển thị, không chặn gửi). */
function SoftTimer({ askedAt, limitSeconds }: { askedAt: string; limitSeconds: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - new Date(askedAt).getTime()) / 1000));
  const over = elapsed > limitSeconds;
  const mm = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  return (
    <span className={`inline-flex items-center gap-1 text-small ${over ? "text-warning" : "text-ink-muted"}`} title="Gợi ý thời gian, không bắt buộc">
      <Timer aria-hidden="true" className="size-4" />
      <span className="font-mono tabular">{mm(elapsed)} / {mm(limitSeconds)}</span>{over ? " · nên gửi câu trả lời" : ""}
    </span>
  );
}

function Interview() {
  const [interview, setInterview] = useState<Interview | null | undefined>(undefined);
  const [answer, setAnswer] = useState("");
  // PRD-AIV-2: dán > 500 ký tự trong một lần => gắn cờ cho admin (không chặn)
  const [pasted, setPasted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>("");
  const [eligibility, setEligibility] = useState<InterviewEligibility | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const call = useRealtimeVoice(submitTranscript);

  useEffect(() => {
    aiApi.myInterview().then(setInterview).catch(() => setInterview(null));
    aiApi.interviewEligibility().then(setEligibility).catch(() => setEligibility(null));
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [interview]);

  async function start(mode: InterviewMode = "CHAT", consent = false) {
    setBusy(true);
    setError("");
    try {
      if (mode === "VOICE") await startVoice(consent);
      else setInterview(await aiApi.startInterview(true));
    } catch (err) {
      setError(err instanceof ApiError && err.code === "PROFILE_REQUIRED" ? <>{errorMessage(err)} <Link href="/profile">Tạo hồ sơ</Link></> : errorMessage(err));
      aiApi.interviewEligibility().then(setEligibility).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  /** FR-7.7 — tạo buổi giọng nói (hoặc nhận lại buổi đang dở < 30 phút với client secret mới) rồi gọi WebRTC. */
  async function startVoice(consent: boolean) {
    const res = await aiApi.startVoiceInterview(true, consent);
    if (res.interview.id !== interview?.id) call.reset(); // buổi mới => bản ghi mới; kết nối lại => giữ bản ghi cũ
    setInterview(res.interview);
    setSession(res.voice);
    if (!res.voice) {
      setError(`${VOICE_DISABLED} trên máy chủ này.`);
      return;
    }
    await call.connect(res.voice);
  }

  async function reconnect() {
    setBusy(true);
    setError("");
    try {
      await startVoice(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitTranscript(items: VoiceTranscriptItem[]) {
    if (!interview) return;
    setBusy(true);
    setError("");
    try {
      setInterview(await aiApi.submitVoiceTranscript(interview.id, items));
      aiApi.interviewEligibility().then(setEligibility).catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
      call.setPhase("dropped"); // ví dụ EMPTY_TRANSCRIPT: kết nối lại để trả lời tiếp
    } finally {
      setBusy(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!interview) return;
    setBusy(true);
    setError("");
    try {
      setInterview(await aiApi.answerInterview(interview.id, answer, pasted));
      setAnswer("");
      setPasted(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (interview === undefined) return <Loading />;
  const inProgress = interview?.status === "IN_PROGRESS";
  const voiceMode = interview?.mode === "VOICE";
  const minChars = interview?.answerMinChars ?? 50;
  const maxChars = interview?.answerMaxChars ?? 3000;
  const len = answer.trim().length;

  const retry = (label: string, disabled?: boolean) => (
    <Button variant="primary" onClick={() => setInterview(null)} disabled={disabled}>{label}</Button>
  );

  return (
    <>
      <PageHeader
        title="AI Interview"
        description="Buổi phỏng vấn tự động giúp xác thực năng lực trước khi tài khoản mentor được kích hoạt."
        actions={interview && <>{voiceMode && <Badge>Giọng nói</Badge>}<StatusBadge status={interview.status} /></>}
      />
      <Alert className="mb-6">{error}</Alert>

      {!interview && <IntroCard eligibility={eligibility} busy={busy} onStart={start} />}

      {interview && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {inProgress && voiceMode ? (
            <VoiceCallCard entries={call.entries} phase={call.phase} topics={session?.topics ?? []} error={call.error}
              footer={
                call.phase === "live" ? <Button variant="danger" icon={PhoneOff} onClick={call.finish}>Kết thúc và nộp bài</Button>
                  : call.phase === "connecting" ? <Button loading disabled>Đang kết nối…</Button>
                  : call.phase === "ended" || busy ? <Button loading disabled>Đang chấm điểm…</Button>
                  : (
                    <>
                      <span className="text-small text-ink-muted">
                        {interview.resumeDeadline && <>Kết nối lại được tới {formatDateTime(interview.resumeDeadline)}. </>}
                        Quá hạn, buổi phỏng vấn bị huỷ và tính là một lần.
                      </span>
                      <Button variant="primary" icon={Mic} className="ml-auto" onClick={reconnect}>
                        {call.entries.length ? "Kết nối lại" : "Bắt đầu nói chuyện"}
                      </Button>
                    </>
                  )
              } />
          ) : (
          <Card>
            <CardHeader title="Hội thoại" actions={inProgress && <Badge tone="accent">Câu {interview.currentTurn}/{interview.maxTurns}</Badge>} />
            <CardBody>
              <InterviewTranscript interview={interview} />
              <div ref={bottom} />
            </CardBody>
            {inProgress && (
              <form onSubmit={send} className="card-foot flex-col items-stretch">
                <Textarea value={answer} aria-label="Câu trả lời" onChange={(e) => setAnswer(e.target.value)}
                  onPaste={(e) => { if (e.clipboardData.getData("text").length > 500) setPasted(true); }}
                  maxLength={maxChars} disabled={busy} placeholder="Nhập câu trả lời của bạn…" className="min-h-[160px]" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className={`text-small tabular ${len > 0 && len < minChars ? "text-warning" : "text-ink-muted"}`}>
                    {len}/{maxChars} ký tự{len < minChars ? ` · tối thiểu ${minChars}` : ""}
                  </span>
                  {interview.currentQuestion && <SoftTimer askedAt={interview.currentQuestion.askedAt} limitSeconds={interview.softTimerSeconds ?? 360} />}
                  <Button type="submit" variant="primary" className="ml-auto" loading={busy} disabled={len < minChars || len > maxChars}>
                    {busy ? "AI đang đánh giá…" : "Gửi câu trả lời"}
                  </Button>
                </div>
                {interview.resumeDeadline && (
                  <div className="text-small text-ink-muted">
                    Bạn có thể tạm dừng và quay lại tới {formatDateTime(interview.resumeDeadline)}. Quá hạn, buổi phỏng vấn bị huỷ và tính là một lần.
                  </div>
                )}
              </form>
            )}
          </Card>
          )}
          <div className="flex min-w-0 flex-col gap-6">
            {inProgress && voiceMode && session && <TopicPlan topics={session.topics} />}
            {interview.status === "PENDING_REVIEW" && (
              <Alert tone="info" title="Đang chờ quản trị viên xem xét">Nhận xét từng câu sẽ hiện sau khi quản trị viên quyết định.</Alert>
            )}
            {interview.status === "ABANDONED" && (
              <Alert action={retry("Bắt đầu buổi mới", eligibility != null && !eligibility.canStart)}>
                {voiceMode ? "Buổi phỏng vấn giọng nói quá 30 phút chưa kết thúc" : "Buổi phỏng vấn quá 72 giờ không hoạt động"} nên bị huỷ và tính là một lần phỏng vấn.
              </Alert>
            )}
            {interview.status === "APPROVED" && (
              <Alert tone="success" title="Tài khoản mentor đã được kích hoạt">Bạn sẽ xuất hiện trong kết quả gợi ý cho mentee.</Alert>
            )}
            {interview.status === "RETAKE_REQUESTED" && (
              <Alert tone="info" action={retry("Phỏng vấn lại")}>Quản trị viên đề nghị bạn phỏng vấn lại. Lần này không bị tính vào số lần phỏng vấn.</Alert>
            )}
            {interview.status === "REJECTED" && (
              <Alert title="Hồ sơ chưa được duyệt" action={retry("Phỏng vấn lại", eligibility != null && !eligibility.canStart)}>
                Cập nhật hồ sơ rồi phỏng vấn lại.
                {eligibility?.reason === "COOLDOWN" && <> Bạn có thể phỏng vấn lại từ {formatDateTime(eligibility.cooldownUntil)}.</>}
                {eligibility?.reason === "LOCKED" && <> Bạn đã hết số lần phỏng vấn, liên hệ quản trị viên để được mở khoá.</>}
              </Alert>
            )}
            <AssessmentCard interview={interview} />
            <Card>
              <CardBody>
                <DescriptionList items={[
                  ["Bắt đầu", formatDateTime(interview.createdAt)],
                  ...(interview.completedAt ? [["Hoàn thành", formatDateTime(interview.completedAt)] as [string, string]] : []),
                  ...(interview.reviewedAt ? [["Quản trị viên xử lý", `${formatDateTime(interview.reviewedAt)} (${STATUS_LABELS[interview.status]})`] as [string, string]] : []),
                ]} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default function InterviewPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      <Interview />
    </RequireAuth>
  );
}
