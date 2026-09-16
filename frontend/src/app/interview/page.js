"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { AssessmentCard, InterviewTranscript } from "@/features/mentoring/InterviewViews";
import { mentoringApi } from "@/features/mentoring/api";
import { STATUS_LABELS, formatDateTime } from "@/lib/format";

function Interview() {
  const [interview, setInterview] = useState(undefined);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef(null);

  useEffect(() => {
    mentoringApi.myInterview().then(setInterview).catch(() => setInterview(null));
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [interview]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      setInterview(await mentoringApi.startInterview());
    } catch (err) {
      setError(err.code === "PROFILE_REQUIRED" ? <>{err.message} <Link href="/profile">Tạo hồ sơ</Link></> : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setInterview(await mentoringApi.answerInterview(interview.id, answer));
      setAnswer("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (interview === undefined) return <Loading />;
  const inProgress = interview?.status === "IN_PROGRESS";

  return (
    <>
      <PageHead title="AI Interview" subtitle="Buổi phỏng vấn tự động giúp xác thực năng lực trước khi tài khoản mentor được kích hoạt.">
        {interview && <StatusBadge status={interview.status} />}
      </PageHead>
      <Alert>{error}</Alert>

      {!interview && (
        <div className="card" style={{ maxWidth: 720 }}>
          <h2>Trước khi bắt đầu</h2>
          <ul>
            <li>Buổi phỏng vấn gồm một số câu hỏi cố định, câu hỏi sau được điều chỉnh theo câu trả lời trước.</li>
            <li>Hãy trả lời chi tiết, nêu ví dụ từ kinh nghiệm thực tế và các đánh đổi (trade-off) bạn đã cân nhắc.</li>
            <li>Kết quả AI chỉ mang tính hỗ trợ — quản trị viên sẽ xem xét trước khi kích hoạt tài khoản.</li>
          </ul>
          <button className="btn" onClick={start} disabled={busy}>{busy ? "Đang chuẩn bị câu hỏi..." : "Bắt đầu phỏng vấn"}</button>
        </div>
      )}

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
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={5000} disabled={busy} placeholder="Nhập câu trả lời của bạn..." style={{ minHeight: 140 }} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={busy || !answer.trim()}>{busy ? "AI đang đánh giá..." : "Gửi câu trả lời"}</button>
                  <span className="muted small">{answer.length}/5000</span>
                </div>
              </form>
            )}
          </div>
          <div className="stack">
            {interview.status === "PENDING_REVIEW" && <Alert type="info">Bạn đã hoàn thành phỏng vấn. Kết quả đang chờ quản trị viên xem xét.</Alert>}
            {interview.status === "APPROVED" && <Alert type="success">Tài khoản mentor đã được kích hoạt. Bạn sẽ xuất hiện trong kết quả gợi ý cho mentee.</Alert>}
            {interview.status === "REJECTED" && (
              <div className="card">
                <Alert>Hồ sơ chưa được duyệt. Bạn có thể cập nhật hồ sơ và phỏng vấn lại.</Alert>
                <button className="btn" onClick={() => { setInterview(null); }}>Phỏng vấn lại</button>
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
