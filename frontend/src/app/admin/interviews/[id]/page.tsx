"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge, Flash } from "@/components/ui";
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
    <div className="card">
      <h2>Số lần phỏng vấn của mentor</h2>
      <p className="small">
        Đã dùng {eligibility.attemptsUsed}/{eligibility.maxAttempts} · còn lại {eligibility.attemptsLeft}
        {eligibility.cooldownUntil && <> · chờ tới {formatDateTime(eligibility.cooldownUntil)}</>}
      </p>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      {eligibility.locked && (
        <>
          <Alert type="info">Mentor đã bị từ chối {eligibility.maxAttempts} lần và đang bị khoá phỏng vấn.</Alert>
          <div className="field"><label>Ghi chú mở khoá (lưu vào nhật ký)</label><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
          <button className="btn secondary" onClick={unlock}>Mở khoá phỏng vấn</button>
        </>
      )}
    </div>
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
  return (
    <>
      <PageHead title={`AI Interview — ${interview.mentorName || "Mentor"}`} subtitle={`${interview.domain} · ${interview.skills.join(", ")}`}>
        <StatusBadge status={interview.status} />
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Toàn bộ hội thoại</h2>
          <InterviewTranscript interview={interview} admin />
        </div>
        <div className="stack">
          <AssessmentCard interview={interview} />
          {interview.status === "PENDING_REVIEW" && (
            <div className="card">
              <h2>Quyết định của quản trị viên</h2>
              <p className="muted small">Hãy đọc kỹ câu trả lời — AI có thể chấm sai. Mentor chỉ xuất hiện trong kết quả AI Matching sau khi được duyệt.</p>
              <p className="muted small">
                Bắt buộc ghi chú (≥ {MIN_NOTE} ký tự) khi quyết định ngược khuyến nghị AI: duyệt khi AI khuyến nghị từ chối, từ chối khi AI khuyến nghị duyệt,
                hoặc yêu cầu làm lại khi AI đã khuyến nghị duyệt/từ chối. AI khuyến nghị &quot;Cần xem xét&quot; thì không bắt buộc.
              </p>
              <div className="field"><label>Nhận xét gửi mentor</label><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
              <div className="row">
                <button className="btn good" onClick={() => decide("APPROVE")}>Duyệt & kích hoạt{noteRequired("APPROVE", interview.recommendation) ? " *" : ""}</button>
                <button className="btn danger" onClick={() => decide("REJECT")}>Từ chối{noteRequired("REJECT", interview.recommendation) ? " *" : ""}</button>
                <button className="btn secondary" onClick={() => decide("REQUEST_RETAKE")}>Yêu cầu làm lại{noteRequired("REQUEST_RETAKE", interview.recommendation) ? " *" : ""}</button>
              </div>
              <p className="muted small">* cần ghi chú. &quot;Yêu cầu làm lại&quot; không tính vào số lần phỏng vấn, mentor có thể bắt đầu lại ngay.</p>
            </div>
          )}
          <AttemptsCard mentorId={interview.mentorId} />
          <Link href="/admin/interviews" className="small">← Danh sách</Link>
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
