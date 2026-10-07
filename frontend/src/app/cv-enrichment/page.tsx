"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import CvConsent from "@/features/ai/CvConsent";
import CvReview, { initialFields } from "@/features/ai/CvReview";
import { ApiError, errorMessage } from "@/lib/api";
import type { ConfirmedCvFields, Cv, CvUploadResult, SessionUser } from "@/types";

/** Thông tin CV mà chatbot đang dùng: bản người dùng đã duyệt (US-20). */
function ConfirmedCvCard({ cv }: { cv: Cv }) {
  const p = initialFields(cv);
  return (
    <div className="card">
      <h2>Thông tin CV đã xác nhận</h2>
      <p className="muted small">
        {cv.fileName} · engine {cv.engine} · {cv.consentExternalAi ? "đã đồng ý gửi AI bên ngoài" : "chỉ xử lý trên nền tảng (rule-based)"}
      </p>
      {p.role && <p><strong>Vai trò:</strong> {p.role}</p>}
      <p><strong>Kinh nghiệm:</strong> {p.yearsExperience != null ? `${p.yearsExperience} năm` : "chưa xác định"}</p>
      <div className="field">
        <strong>Kỹ năng</strong>
        <div className="chips" style={{ marginTop: 4 }}>
          {p.skills.length === 0 && <span className="muted small">Không có</span>}
          {p.skills.map((s) => <span className="chip" key={s}>{s}</span>)}
        </div>
      </div>
      {p.projects.length > 0 && (
        <div className="field">
          <strong>Dự án</strong>
          <ul style={{ margin: "4px 0", paddingLeft: "1.2rem" }}>
            {p.projects.map((pr, i) => (
              <li key={i}>
                {pr.name}
                {pr.technologies.length > 0 && <span className="muted small"> — {pr.technologies.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.education.length > 0 && <p className="small"><strong>Học vấn:</strong> {p.education.join("; ")}</p>}
    </div>
  );
}

function Enrichment({ user }: { user: SessionUser }) {
  const [state, setState] = useState<CvUploadResult | null | undefined>(undefined);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiApi.latestEnrichment(user.userId).then((r) => setState(r)).catch(() => setState(null));
  }, [user]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setState(await aiApi.uploadCv(user.userId, file, consent));
    } catch (err) {
      setError(err instanceof ApiError && err.code === "PROFILE_REQUIRED" ? <>{errorMessage(err)} <Link href="/profile">Tạo hồ sơ</Link></> : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** US-20: lưu thông tin đã duyệt rồi bắt đầu chatbot. Lỗi được CvReview hiển thị. */
  async function confirmAndStart(cv: Cv, fields: ConfirmedCvFields) {
    setBusy(true);
    setError("");
    try {
      const confirmed = await aiApi.confirmCvFields(cv.id, fields);
      setState({ cv: confirmed, conversation: null });
      setState(await aiApi.startEnrichment(cv.id));
    } finally {
      setBusy(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !state?.conversation) return;
    setBusy(true);
    setError("");
    try {
      const conversation = await aiApi.answerEnrichment(state.conversation.id, answer);
      setState({ ...state, conversation });
      setAnswer("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === undefined) return <Loading />;
  const conv = state?.conversation ?? null;
  const completed = conv?.status === "COMPLETED";

  return (
    <>
      <PageHead title="CV & làm rõ mục tiêu" subtitle="Tải CV (PDF), xem lại thông tin trích xuất, rồi chatbot sẽ hỏi thêm vài câu để hiểu rõ mục tiêu học tập của bạn." />
      <Alert>{error}</Alert>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <CvConsent checked={consent} onChange={setConsent} audience="MENTEE" disabled={busy} />
        <div className="row">
          <div style={{ flex: 1 }}>
            <strong>{state ? "Tải CV mới để bắt đầu lại" : "Tải CV của bạn"}</strong>
            <div className="hint">PDF có lớp văn bản, tối đa 5MB.</div>
          </div>
          <input type="file" accept="application/pdf" disabled={busy} style={{ maxWidth: 300 }} onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
      {busy && !state && <Loading text="Đang phân tích CV..." />}
      {state && !conv && <CvReview key={state.cv.id} cv={state.cv} busy={busy} onConfirm={(fields) => confirmAndStart(state.cv, fields)} />}
      {state && conv && (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <ConfirmedCvCard cv={state.cv} />
          <div className="card">
            <div className="row between">
              <h2>Chatbot làm rõ mục tiêu</h2>
              <span className="badge primary">{completed ? "Hoàn thành" : `Câu ${conv.currentTurn}/${conv.maxTurns}`}</span>
            </div>
            <div className="chat">
              {conv.messages.map((m) => (
                <div key={m.turnNo} className="chat">
                  <div className="bubble bot"><div className="meta">{m.slotLabel}</div>{m.question}</div>
                  {m.answer && <div className="bubble me">{m.answer}</div>}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {!completed && (
              <form onSubmit={send} style={{ marginTop: "1rem" }}>
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Nhập câu trả lời..." maxLength={5000} disabled={busy} />
                <button className="btn" disabled={busy || !answer.trim()} style={{ marginTop: 8 }}>{busy ? "Đang xử lý..." : "Gửi"}</button>
              </form>
            )}
            {completed && (
              <div style={{ marginTop: "1rem" }}>
                <Alert type="success">
                  Mục tiêu đã được tổng hợp{conv.profileSynced ? " và cập nhật vào hồ sơ (đã sinh lại embedding)." : ", đang đồng bộ vào hồ sơ..."}
                </Alert>
                <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
                  <strong>Mục tiêu đã làm rõ</strong>
                  <p style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{conv.enrichedGoal}</p>
                </div>
                <Link href="/matching" className="btn" style={{ marginTop: "1rem" }}>Tìm mentor phù hợp</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function CvEnrichmentPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Enrichment user={user} />}</RequireAuth>;
}
