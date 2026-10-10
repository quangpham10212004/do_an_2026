"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Check, RotateCcw, X } from "lucide-react";
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, Field, FlashAlerts, Input, Loading, PageHeader, StatusBadge, Textarea, type Flash } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { AssessmentCard, InterviewTranscript } from "@/features/ai/InterviewViews";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Interview, InterviewEligibility, Recommendation, ReviewDecision } from "@/types";

const MIN_NOTE = 10;

/**
 * US-23 — bắt buộc ghi chú (≥ 10 ký tự) khi quyết định ngược khuyến nghị AI (giống rubric.note_required ở ai-service):
 * APPROVE khi AI = REJECT, REJECT khi AI = APPROVE, REQUEST_RETAKE khi AI = APPROVE/REJECT; AI = NEEDS_REVIEW => không bắt buộc.
 */
function noteRequired(decision: ReviewDecision, recommendation: Recommendation | null): boolean {
  if (recommendation !== "APPROVE" && recommendation !== "REJECT") return false;
  if (decision === "REQUEST_RETAKE") return true;
  return decision !== recommendation;
}

/** US-22: số lần phỏng vấn của mentor + nút mở khoá khi bị từ chối đủ số lần tối đa. */
function AttemptsCard({ mentorId }: { mentorId: string }) {
  const [eligibility, setEligibility] = useState<InterviewEligibility | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Flash>({});
  useEffect(() => {
    aiApi.adminInterviewEligibility(mentorId).then(setEligibility).catch(() => setEligibility(null));
  }, [mentorId]);

  async function unlock() {
    setMsg({});
    try {
      setEligibility(await aiApi.unlockInterviews(mentorId, note));
      setMsg({ ok: "Đã mở khoá — mentor có thể phỏng vấn lại." });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  if (!eligibility) return null;
  return (
    <Card>
      <CardHeader title="Số lần phỏng vấn"
        description={<>Đã dùng {eligibility.attemptsUsed}/{eligibility.maxAttempts} · còn lại {eligibility.attemptsLeft}
          {eligibility.cooldownUntil && <> · chờ tới {formatDateTime(eligibility.cooldownUntil)}</>}</>} />
      {(msg.ok || msg.error || eligibility.locked) && (
        <CardBody className="flex flex-col gap-3">
          <FlashAlerts flash={msg} />
          {eligibility.locked && (
            <>
              <Alert tone="warning">Mentor đã bị từ chối {eligibility.maxAttempts} lần và đang bị khoá phỏng vấn.</Alert>
              <Field label="Ghi chú mở khoá" id="unlock-note" hint="Lưu vào nhật ký quản trị.">
                <Input id="unlock-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              </Field>
              <div><Button onClick={unlock}>Mở khoá phỏng vấn</Button></div>
            </>
          )}
        </CardBody>
      )}
    </Card>
  );
}

function InterviewReview({ id }: { id: string }) {
  const [interview, setInterview] = useState<Interview | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Flash>({});

  useEffect(() => {
    aiApi.interview(id).then(setInterview).catch((e) => { setMsg({ error: errorMessage(e) }); setInterview(null); });
  }, [id]);

  async function decide(decision: ReviewDecision) {
    setMsg({});
    try {
      if (interview && noteRequired(decision, interview.recommendation) && note.trim().length < MIN_NOTE) {
        setMsg({ error: `Quyết định khác khuyến nghị của AI — vui lòng ghi rõ lý do (ít nhất ${MIN_NOTE} ký tự).` });
        return;
      }
      setInterview(await aiApi.reviewInterview(id, decision, note));
      setMsg({ ok: decision === "APPROVE" ? "Đã kích hoạt mentor." : decision === "REJECT" ? "Đã từ chối mentor." : "Đã yêu cầu mentor phỏng vấn lại (không tính vào số lần)." });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  if (interview === undefined) return <Loading />;
  if (!interview) return <Alert>{msg.error}</Alert>;
  const star = (d: ReviewDecision) => (noteRequired(d, interview.recommendation) ? " *" : "");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/interviews", label: "Duyệt mentor" }}
        title={`AI Interview · ${interview.mentorName || "Mentor"}`}
        description={`${interview.domain} · ${interview.skills.join(", ")}`}
        actions={<StatusBadge status={interview.status} />}
      />
      <FlashAlerts flash={msg} className="mb-6" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Toàn bộ hội thoại" />
          <CardBody><InterviewTranscript interview={interview} admin /></CardBody>
        </Card>
        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20">
          {interview.status === "PENDING_REVIEW" && (
            <Card>
              <CardHeader title="Quyết định của quản trị viên"
                description="Đọc kỹ câu trả lời, AI có thể chấm sai. Mentor chỉ xuất hiện trong AI Matching sau khi được duyệt." />
              <CardBody className="flex flex-col gap-3">
                <Field label="Nhận xét gửi mentor" id="review-note"
                  hint={`Bắt buộc (từ ${MIN_NOTE} ký tự) khi quyết định ngược khuyến nghị AI. AI khuyến nghị “Cần xem xét” thì không bắt buộc.`}>
                  <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                </Field>
                <p className="text-small text-ink-muted">* cần nhận xét. “Yêu cầu làm lại” không tính vào số lần phỏng vấn, mentor có thể bắt đầu lại ngay.</p>
              </CardBody>
              <CardFooter>
                <Button icon={RotateCcw} onClick={() => decide("REQUEST_RETAKE")}>Yêu cầu làm lại{star("REQUEST_RETAKE")}</Button>
                <Button variant="danger" icon={X} onClick={() => decide("REJECT")}>Từ chối{star("REJECT")}</Button>
                <Button variant="primary" icon={Check} onClick={() => decide("APPROVE")}>Duyệt và kích hoạt{star("APPROVE")}</Button>
              </CardFooter>
            </Card>
          )}
          <AssessmentCard interview={interview} />
          <AttemptsCard mentorId={interview.mentorId} />
        </div>
      </div>
    </>
  );
}

export default function AdminInterviewDetailPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <InterviewReview id={params.id} />
    </RequireAuth>
  );
}
