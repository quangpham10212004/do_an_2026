"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { AssessmentCard, InterviewTranscript, RUBRIC } from "@/features/ai/InterviewViews";
import { aiApi } from "@/features/ai/api";
import { STATUS_LABELS, formatDateTime } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { Interview, InterviewEligibility } from "@/types";

/** US-22 (PRD-AIV-1, PRD-AIV-4): màn hình giới thiệu trước khi bắt đầu + quy tắc số lần phỏng vấn. */
function IntroCard({ eligibility, busy, onStart }: { eligibility: InterviewEligibility | null; busy: boolean; onStart: () => void }) {
  const [ack, setAck] = useState(false);
  const blocked = eligibility != null && !eligibility.canStart;
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h2>Trước khi bắt đầu</h2>
      <ul>
        <li>Buổi phỏng vấn gồm <strong>{eligibility?.questionCount ?? 5} câu hỏi</strong>, thời gian dự kiến <strong>15–20 phút</strong>. Câu hỏi sau được điều chỉnh theo câu trả lời trước.</li>
        <li>Mỗi câu trả lời được chấm theo 4 tiêu chí (thang 0–10):</li>
      </ul>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tiêu chí</th><th>Trọng số</th><th>Mức cao (7–10)</th></tr></thead>
          <tbody>
            {RUBRIC.map((c) => (
              <tr key={c.key}><td>{c.label}</td><td>{c.weight}%</td><td className="small">{c.bands[2]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        <li>Kết quả AI chỉ mang tính hỗ trợ — <strong>quản trị viên đưa ra quyết định cuối cùng</strong> trước khi kích hoạt tài khoản.</li>
        <li>
          Bạn có tối đa {eligibility?.maxAttempts ?? 3} lần phỏng vấn; sau khi bị từ chối cần chờ 7 ngày mới được làm lại, bị từ chối{" "}
          {eligibility?.maxAttempts ?? 3} lần thì cần quản trị viên mở khoá.
        </li>
      </ul>
      {eligibility && (
        <p className="small">
          Đã dùng <strong>{eligibility.attemptsUsed}/{eligibility.maxAttempts}</strong> lần · còn lại <strong>{eligibility.attemptsLeft}</strong> lần
        </p>
      )}
      {eligibility?.reason === "COOLDOWN" && <Alert type="info">Bạn có thể phỏng vấn lại từ {formatDateTime(eligibility.cooldownUntil)}.</Alert>}
      {eligibility?.reason === "LOCKED" && <Alert>Bạn đã bị từ chối {eligibility.maxAttempts} lần. Vui lòng liên hệ quản trị viên để được mở khoá.</Alert>}
      <label className="row" style={{ gap: 8, margin: "0.75rem 0" }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={blocked} />
        <span>Tôi tự trả lời, không có sự trợ giúp từ bên ngoài</span>
      </label>
      <button className="btn" onClick={onStart} disabled={busy || !ack || blocked}>{busy ? "Đang chuẩn bị câu hỏi..." : "Bắt đầu phỏng vấn"}</button>
    </div>
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
    <span className={`small ${over ? "" : "muted"}`} title="Gợi ý thời gian, không bắt buộc" style={over ? { color: "#c0392b" } : undefined}>
      ⏱ {mm(elapsed)} / {mm(limitSeconds)}{over ? " — nên gửi câu trả lời" : ""}
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
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiApi.myInterview().then(setInterview).catch(() => setInterview(null));
    aiApi.interviewEligibility().then(setEligibility).catch(() => setEligibility(null));
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [interview]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      setInterview(await aiApi.startInterview(true));
    } catch (err) {
      setError(err instanceof ApiError && err.code === "PROFILE_REQUIRED" ? <>{errorMessage(err)} <Link href="/profile">Tạo hồ sơ</Link></> : errorMessage(err));
      aiApi.interviewEligibility().then(setEligibility).catch(() => {});
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
  const minChars = interview?.answerMinChars ?? 50;
  const maxChars = interview?.answerMaxChars ?? 3000;
  const len = answer.trim().length;

  return (
    <>
      <PageHead title="AI Interview" subtitle="Buổi phỏng vấn tự động giúp xác thực năng lực trước khi tài khoản mentor được kích hoạt.">
        {interview && <StatusBadge status={interview.status} />}
      </PageHead>
      <Alert>{error}</Alert>

      {!interview && <IntroCard eligibility={eligibility} busy={busy} onStart={start} />}

      {interview && (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className="row between">
              <h2>Hội thoại</h2>
              {inProgress && <span className="badge primary">Câu {interview.currentTurn}/{interview.maxTurns}</span>}
            </div>
            <InterviewTranscript interview={interview} />
            <div ref={bottom} />
            {inProgress && (
              <form onSubmit={send} style={{ marginTop: "1rem" }}>
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} onPaste={(e) => { if (e.clipboardData.getData("text").length > 500) setPasted(true); }} maxLength={maxChars} disabled={busy} placeholder="Nhập câu trả lời của bạn..." style={{ minHeight: 140 }} />
                <div className="row between" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={busy || len < minChars || len > maxChars}>{busy ? "AI đang đánh giá..." : "Gửi câu trả lời"}</button>
                  <span className={`small ${len > 0 && len < minChars ? "" : "muted"}`}>{len}/{maxChars} ký tự{len < minChars ? ` · tối thiểu ${minChars}` : ""}</span>
                  {interview.currentQuestion && <SoftTimer askedAt={interview.currentQuestion.askedAt} limitSeconds={interview.softTimerSeconds ?? 360} />}
                </div>
                {interview.resumeDeadline && (
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Bạn có thể tạm dừng và quay lại tới {formatDateTime(interview.resumeDeadline)}; quá hạn buổi phỏng vấn bị huỷ và tính là một lần.
                  </div>
                )}
              </form>
            )}
          </div>
          <div className="stack">
            {interview.status === "PENDING_REVIEW" && <Alert type="info">Bạn đã hoàn thành phỏng vấn. Kết quả đang chờ quản trị viên xem xét — nhận xét từng câu sẽ hiện sau khi quản trị viên quyết định.</Alert>}
            {interview.status === "ABANDONED" && (
              <div className="card">
                <Alert>Buổi phỏng vấn đã quá 72 giờ không hoạt động nên bị huỷ và tính là một lần phỏng vấn.</Alert>
                <button className="btn" onClick={() => { setInterview(null); }} disabled={eligibility != null && !eligibility.canStart}>Bắt đầu buổi mới</button>
              </div>
            )}
            {interview.status === "APPROVED" && <Alert type="success">Tài khoản mentor đã được kích hoạt. Bạn sẽ xuất hiện trong kết quả gợi ý cho mentee.</Alert>}
            {interview.status === "RETAKE_REQUESTED" && (
              <div className="card">
                <Alert type="info">Quản trị viên đề nghị bạn phỏng vấn lại. Lần này không bị tính vào số lần phỏng vấn.</Alert>
                <button className="btn" onClick={() => { setInterview(null); }}>Phỏng vấn lại</button>
              </div>
            )}
            {interview.status === "REJECTED" && (
              <div className="card">
                <Alert>Hồ sơ chưa được duyệt. Bạn có thể cập nhật hồ sơ và phỏng vấn lại.</Alert>
                {eligibility?.reason === "COOLDOWN" && <p className="small">Bạn có thể phỏng vấn lại từ {formatDateTime(eligibility.cooldownUntil)}.</p>}
                {eligibility?.reason === "LOCKED" && <p className="small">Bạn đã hết số lần phỏng vấn — vui lòng liên hệ quản trị viên để được mở khoá.</p>}
                <button className="btn" onClick={() => { setInterview(null); }} disabled={eligibility != null && !eligibility.canStart}>Phỏng vấn lại</button>
              </div>
            )}
            <AssessmentCard interview={interview} />
            <div className="card small muted">
              Bắt đầu: {formatDateTime(interview.createdAt)}
              {interview.completedAt && <> · Hoàn thành: {formatDateTime(interview.completedAt)}</>}
              {interview.reviewedAt && <> · Admin xử lý: {formatDateTime(interview.reviewedAt)} ({STATUS_LABELS[interview.status]})</>}
            </div>
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
