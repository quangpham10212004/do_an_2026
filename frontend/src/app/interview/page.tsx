"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Mic, PhoneOff } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Checkbox, DescriptionList, Loading, PageHeader, StatusBadge, Table } from "@/components/ui";
import { AssessmentCard, InterviewTranscript, RUBRIC } from "@/features/ai/InterviewViews";
import { TopicPlan, VOICE_DISABLED, VoiceCallCard, VoiceConsent } from "@/features/ai/VoiceViews";
import { aiApi } from "@/features/ai/api";
import { useRealtimeVoice } from "@/features/ai/useRealtimeVoice";
import { STATUS_LABELS, formatDateTime } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { Interview, VerificationState, VoiceSession, VoiceTranscriptItem } from "@/types";

/** US-22 (PRD-AIV-1, PRD-AIV-4): màn hình giới thiệu trước khi bắt đầu + quy tắc số lần phỏng vấn. */
function IntroCard({ eligibility, busy, onStart }: { eligibility: VerificationState | null; busy: boolean; onStart: (consent: boolean) => void }) {
  const [ack, setAck] = useState(false);
  const [consent, setConsent] = useState(false);
  const voiceOff = eligibility != null && !eligibility.voiceAvailable;
  const blocked = eligibility != null && !eligibility.canStart;
  const max = eligibility?.maxAttempts ?? 2;
  const days = 15;
  return (
    <Card className="max-w-[820px]">
      <CardHeader title="Trước khi bắt đầu" description="Đọc kỹ cách chấm điểm và quy tắc số lần phỏng vấn." />
      <CardBody className="flex flex-col gap-5">
        <p className="text-small text-ink-muted">
          Bạn trò chuyện trực tiếp với người phỏng vấn AI qua micro. Buổi phỏng vấn làm trong <strong>một lần</strong>: rớt mạng thì kết nối lại được
          trong 30 phút; quá 30 phút chưa kết thúc thì buổi bị huỷ và tính là một lần. Cần trình duyệt có micro (Chrome, Edge, Safari mới).
        </p>
        {voiceOff && <Alert tone="warning">{VOICE_DISABLED}.</Alert>}
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Gồm khoảng <strong>4 chủ đề</strong>, khoảng <strong>15 phút</strong>. Người phỏng vấn hỏi đào sâu khi câu trả lời còn chung chung.</li>
          <li>Mỗi chủ đề được chấm theo 4 tiêu chí, thang 0–10:</li>
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
          <li>Tối đa {max} lần làm vòng 1 không hoàn thành hợp lệ (ví dụ bỏ dở quá 30 phút); hết lượt hoặc bị từ chối thì chờ {days} ngày mới được xác thực lại. Quản trị viên yêu cầu làm lại thì không tính vào số lần.</li>
        </ul>
        {eligibility && (
          <p className="text-small">
            Đã dùng <strong className="tabular">{eligibility.attemptsUsed}/{eligibility.maxAttempts}</strong> lần không hoàn thành, còn lại <strong className="tabular">{eligibility.attemptsLeft}</strong> lần.
          </p>
        )}
        {eligibility?.reason === "COOLDOWN" && <Alert tone="info">Bạn có thể xác thực lại từ {formatDateTime(eligibility.retryAfter)}.</Alert>}
        <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={blocked} label="Tôi tự trả lời, không có sự trợ giúp từ bên ngoài" />
        <VoiceConsent checked={consent} onChange={setConsent} disabled={blocked || voiceOff} />
      </CardBody>
      <CardFooter>
        <Button variant="primary" icon={Mic} onClick={() => onStart(consent)} loading={busy} disabled={!ack || blocked || !consent || voiceOff}>
          {busy ? "Đang chuẩn bị câu hỏi…" : "Bắt đầu phỏng vấn"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Interview() {
  const [interview, setInterview] = useState<Interview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>("");
  const [eligibility, setEligibility] = useState<VerificationState | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const call = useRealtimeVoice(submitTranscript);

  useEffect(() => {
    aiApi.myInterview().then(setInterview).catch(() => setInterview(null));
    aiApi.verificationStatus().then(setEligibility).catch(() => setEligibility(null));
  }, []);

  async function start(consent = false) {
    setBusy(true);
    setError("");
    try {
      await startVoice(consent);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "PROFILE_REQUIRED" ? <>{errorMessage(err)} <Link href="/profile">Tạo hồ sơ</Link></> : errorMessage(err));
      aiApi.verificationStatus().then(setEligibility).catch(() => {});
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
      aiApi.verificationStatus().then(setEligibility).catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
      call.setPhase("dropped"); // ví dụ EMPTY_TRANSCRIPT: kết nối lại để trả lời tiếp
    } finally {
      setBusy(false);
    }
  }

  if (interview === undefined) return <Loading />;
  const inProgress = interview?.status === "IN_PROGRESS";

  const retry = (label: string, disabled?: boolean) => (
    <Button variant="primary" onClick={() => setInterview(null)} disabled={disabled}>{label}</Button>
  );

  return (
    <>
      <PageHeader
        title="AI Interview"
        description="Buổi phỏng vấn tự động giúp xác thực năng lực trước khi tài khoản mentor được kích hoạt."
        actions={interview && <><Badge>Giọng nói</Badge><StatusBadge status={interview.status} /></>}
      />
      <Alert className="mb-6">{error}</Alert>

      {!interview && <IntroCard eligibility={eligibility} busy={busy} onStart={start} />}

      {interview && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {inProgress ? (
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
            <CardHeader title="Hội thoại" />
            <CardBody>
              <InterviewTranscript interview={interview} />
            </CardBody>
          </Card>
          )}
          <div className="flex min-w-0 flex-col gap-6">
            {inProgress && session && <TopicPlan topics={session.topics} />}
            {interview.status === "PENDING_REVIEW" && (
              <Alert tone="info" title="Đang chờ quản trị viên xem xét">Nhận xét từng chủ đề sẽ hiện sau khi quản trị viên quyết định.</Alert>
            )}
            {interview.status === "ABANDONED" && (
              <Alert action={retry("Bắt đầu buổi mới", eligibility != null && !eligibility.canStart)}>
                Buổi phỏng vấn giọng nói quá 30 phút chưa kết thúc nên bị huỷ và tính là một lần không hoàn thành.
                {eligibility?.status === "CLOSED" && <> Bạn đã hết lượt, có thể xác thực lại từ {formatDateTime(eligibility.retryAfter)}.</>}
              </Alert>
            )}
            {interview.status === "PASSED" && eligibility?.status === "APPROVED" && (
              <Alert tone="success" title="Tài khoản mentor đã được kích hoạt">Bạn sẽ xuất hiện trong kết quả gợi ý cho mentee.</Alert>
            )}
            {interview.status === "PASSED" && eligibility?.status !== "APPROVED" && (
              <Alert tone="info" title="Bạn đã qua vòng 1">Quản trị viên sẽ liên hệ để hẹn phỏng vấn vòng 2.</Alert>
            )}
            {interview.status === "RETAKE_REQUESTED" && (
              <Alert tone="info" action={retry("Làm lại vòng 1")}>Quản trị viên đề nghị bạn làm lại vòng 1. Lần này không bị tính vào số lần làm.</Alert>
            )}
            {interview.status === "REJECTED" && (
              <Alert title="Hồ sơ chưa được duyệt" action={retry("Phỏng vấn lại", eligibility != null && !eligibility.canStart)}>
                Cập nhật hồ sơ rồi phỏng vấn lại.
                {eligibility?.reason === "COOLDOWN" && <> Bạn có thể xác thực lại từ {formatDateTime(eligibility.retryAfter)}.</>}
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
