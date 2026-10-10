"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Send, SkipForward, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Chip, Chips, DescriptionList, Loading, PageHeader, Textarea } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import CvConsent from "@/features/ai/CvConsent";
import CvReview, { initialFields } from "@/features/ai/CvReview";
import GoalDraft from "@/features/ai/GoalDraft";
import { ApiError, errorMessage } from "@/lib/api";
import type { ConfirmedCvFields, Cv, CvUploadResult, SessionUser } from "@/types";

/** Thông tin CV mà chatbot đang dùng: bản người dùng đã duyệt (US-20); hội thoại cũ (trước Sprint 2) dùng kết quả parse. */
function ConfirmedCvCard({ cv }: { cv: Cv }) {
  const p = initialFields(cv);
  return (
    <Card>
      <CardHeader
        title={cv.confirmedFields ? "Thông tin CV đã xác nhận" : "Thông tin trích xuất từ CV (chưa duyệt)"}
        description={`${cv.fileName} · engine ${cv.engine} · ${cv.consentExternalAi ? "đã đồng ý gửi AI bên ngoài" : "chỉ xử lý trên MentorHub (rule-based)"}`}
      />
      <CardBody className="flex flex-col gap-4">
        <DescriptionList items={[
          ["Vai trò", p.role || "Chưa xác định"],
          ["Kinh nghiệm", p.yearsExperience != null ? `${p.yearsExperience} năm` : "Chưa xác định"],
          ...(p.education.length > 0 ? [["Học vấn", p.education.join("; ")] as [string, string]] : []),
        ]} />
        <div>
          <div className="eyebrow mb-2">Kỹ năng</div>
          <Chips>
            {p.skills.length === 0 && <span className="text-small text-ink-muted">Không có</span>}
            {p.skills.map((s) => <Chip key={s}>{s}</Chip>)}
          </Chips>
        </div>
        {p.projects.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Dự án</div>
            <ul className="flex flex-col gap-1">
              {p.projects.map((pr, i) => (
                <li key={i}>
                  <span className="font-medium">{pr.name}</span>
                  {pr.technologies.length > 0 && <span className="text-small text-ink-muted"> · {pr.technologies.join(", ")}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
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

  // US-45 (PRD-CV-3) — skip = "Bỏ qua" câu hiện tại (không cần nhập gì)
  async function send(e: FormEvent | null, skip = false) {
    e?.preventDefault();
    if ((!skip && !answer.trim()) || !state?.conversation) return;
    setBusy(true);
    setError("");
    try {
      const conversation = await aiApi.answerEnrichment(state.conversation.id, skip ? "" : answer, skip);
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

  const uploadCard = (
    <Card>
      <CardHeader title={state ? "Tải CV mới để bắt đầu lại" : "Tải CV của bạn"} description="PDF có lớp văn bản, tối đa 5 MB." />
      <CardBody className="flex flex-col gap-4">
        <CvConsent checked={consent} onChange={setConsent} audience="MENTEE" disabled={busy} />
      </CardBody>
      <CardFooter>
        <label htmlFor="cv-file" className={`btn ${state ? "" : "btn-primary"} ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {busy ? "Đang xử lý…" : "Chọn file PDF"}
        </label>
        <input id="cv-file" type="file" accept="application/pdf" className="sr-only" disabled={busy}
          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </CardFooter>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="CV và mục tiêu"
        description="Tải CV, xem lại thông tin trích xuất, rồi trả lời vài câu hỏi để chatbot hiểu rõ mục tiêu học tập của bạn."
      />
      <Alert className="mb-6">{error}</Alert>
      {!state && <div className="max-w-[720px]">{uploadCard}</div>}
      {state && !conv && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <CvReview key={state.cv.id} cv={state.cv} busy={busy} onConfirm={(fields) => confirmAndStart(state.cv, fields)} />
          {uploadCard}
        </div>
      )}
      {state && conv && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader
              title="Chatbot làm rõ mục tiêu"
              actions={<Badge tone={completed ? "success" : "accent"}>{completed ? "Hoàn thành" : `Câu ${conv.currentTurn}/${conv.maxTurns}`}</Badge>}
            />
            <CardBody className="flex flex-col gap-6">
              {conv.messages.map((m) => (
                <div key={m.turnNo} className="chat">
                  <div className="bubble-meta">{m.slotLabel}</div>
                  <div className="bubble">{m.question}</div>
                  {m.skipped ? <div className="bubble-meta bubble-meta-me italic">Đã bỏ qua</div>
                    : m.answer && <div className="bubble bubble-me">{m.answer}</div>}
                </div>
              ))}
              <div ref={bottom} />
              {completed && <GoalDraft key={conv.id} conversation={conv} onChange={(conversation) => setState({ ...state, conversation })} />}
            </CardBody>
            {!completed && (
              <form onSubmit={send} className="card-foot flex-col items-stretch">
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Câu trả lời"
                  placeholder="Nhập câu trả lời…" maxLength={5000} disabled={busy} className="min-h-[88px]" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" icon={SkipForward} disabled={busy} onClick={() => send(null, true)}>Bỏ qua câu này</Button>
                  <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!answer.trim()}>{busy ? "Đang xử lý…" : "Gửi"}</Button>
                </div>
              </form>
            )}
          </Card>
          <div className="flex min-w-0 flex-col gap-6">
            <ConfirmedCvCard cv={state.cv} />
            {uploadCard}
          </div>
        </div>
      )}
    </>
  );
}

export default function CvEnrichmentPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Enrichment user={user} />}</RequireAuth>;
}
