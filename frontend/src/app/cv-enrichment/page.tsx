"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Check, FileText, Loader2, Pencil, Send, SkipForward, Sparkles, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Chip, Chips, DescriptionList, Loading, PageHeader, Textarea } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import CvConsent from "@/features/ai/CvConsent";
import { initialFields } from "@/features/ai/CvReview";
import GoalDraft from "@/features/ai/GoalDraft";
import { formatSize } from "@/features/onbx/api";
import { WhyAsk, uploadErrorAlert } from "@/features/onbx/components";
import { ApiError, errorMessage } from "@/lib/api";
import type { Conversation, Cv, CvUploadResult, EnrichmentSlot, SessionUser } from "@/types";

const MAX_BYTES = 5 * 1024 * 1024;
const READ_STEPS = ["Đã tải lên an toàn", "Đã đọc nội dung văn bản", "AI đang tìm kỹ năng và dự án…", "Chuẩn bị câu hỏi làm rõ"];

/** Gợi ý bấm nhanh theo từng loại câu hỏi (bấm là gửi luôn); "Trả lời khác…" đưa con trỏ vào ô nhập. */
const QUICK_REPLIES: Partial<Record<EnrichmentSlot, string[]>> = {
  TARGET_ROLE: ["Backend Developer", "Frontend Developer", "Fullstack Developer", "Data / AI Engineer", "DevOps / Cloud"],
  FOCUS_AREAS: ["Thiết kế hệ thống", "Thuật toán và cấu trúc dữ liệu", "Cơ sở dữ liệu", "Thiết kế API", "Kỹ năng phỏng vấn"],
  PROJECT_EXPERIENCE: ["Chưa làm dự án nào", "Dự án cá nhân hoặc bài tập", "Đã làm dự án thực tế ở công ty"],
  CURRENT_GAPS: ["Thiếu kinh nghiệm thực tế", "Thiếu kiến thức nền", "Chưa tự tin khi phỏng vấn"],
  TIMELINE: ["3 tháng", "6 tháng", "12 tháng"],
  MENTORING_PREFERENCE: ["Review dự án", "Luyện phỏng vấn", "Định hướng lộ trình", "Review CV"],
};

/** Bảng "Hồ sơ đang hình thành": cập nhật theo từng câu trả lời trong cuộc trò chuyện. */
function LiveProfile({ cv, conv }: { cv: Cv; conv: Conversation }) {
  const f = initialFields(cv);
  const fromCv = [...f.skills.slice(0, 4), f.yearsExperience != null ? `${f.yearsExperience} năm` : ""].filter(Boolean);
  const rows = conv.messages.map((m) => {
    const waiting = !m.skipped && !m.answer;
    return { key: m.turnNo, label: m.slotLabel, value: m.skipped ? "Đã bỏ qua" : m.answer, waiting, skipped: m.skipped };
  });
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Sparkles aria-hidden="true" className="size-4 text-accent" />Hồ sơ đang hình thành</span>}
        description="Cập nhật ngay khi bạn trả lời." />
      <CardBody>
        <dl className="ob-live" aria-live="polite">
          <div>
            <dt>Từ CV</dt>
            <dd>{fromCv.length === 0 ? <span className="text-ink-muted">Chưa xác định</span> : <Chips>{fromCv.map((x) => <Chip key={x}>{x}</Chip>)}</Chips>}</dd>
          </div>
          {rows.map((x) => (
            <div key={x.key}>
              <dt>{x.label}</dt>
              <dd className={x.waiting || x.skipped ? "text-ink-muted" : ""}>{x.waiting ? "Đang chờ bạn trả lời…" : x.value}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

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

const STEP_LABELS = ["Tải CV", "Kiểm tra thông tin", "Trò chuyện làm rõ mục tiêu", "Gợi ý mentor"];

function Steps({ current }: { current: number }) {
  return (
    <ol className="ob-steps" aria-label="Các bước làm hồ sơ">
      {STEP_LABELS.map((label, i) => {
        const st = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} data-state={st} aria-current={st === "current" ? "step" : undefined}>
            <span className="ob-dot">{st === "done" ? <Check aria-hidden="true" /> : i + 1}</span>
            <span className="ob-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Enrichment({ user }: { user: SessionUser }) {
  const router = useRouter();
  const fresh = useSearchParams().get("new") === "1";
  const [state, setState] = useState<CvUploadResult | null | undefined>(undefined);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<ReactNode>("");
  const [errorTone, setErrorTone] = useState<"danger" | "warning">("danger");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState(0);
  const [skillHelp, setSkillHelp] = useState<{ conversationId: string; question: string; reply: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const answerBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    aiApi.latestEnrichment(user.userId).then((r) => setState(r)).catch(() => setState(null));
  }, [user]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state]);

  // Đã có CV nhưng chưa duyệt thông tin: sang màn "Kiểm tra thông tin" (trừ khi đang chọn thay CV khác).
  useEffect(() => {
    if (state && !state.conversation && !fresh) router.replace("/onboarding/cv-review");
  }, [state, fresh, router]);

  // Hiệu ứng tiến độ đọc CV (API chỉ trả kết quả một lần khi xong).
  useEffect(() => {
    if (!busy || !pickedFile) return;
    setPhase(0);
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, READ_STEPS.length - 1)), 1500);
    return () => clearInterval(t);
  }, [busy, pickedFile]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setErrorTone("danger");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Hiện chỉ nhận CV định dạng PDF có lớp văn bản.");
      return;
    }
    if (file.size > MAX_BYTES) {
      const { text } = uploadErrorAlert(new ApiError(413, "FILE_TOO_LARGE", ""), file);
      setError(text);
      return;
    }
    setPickedFile(file);
    setBusy(true);
    try {
      const res = await aiApi.uploadCv(user.userId, file, consent);
      setState(res);
      if (!res.conversation) router.push("/onboarding/cv-review");
    } catch (err) {
      if (err instanceof ApiError && err.code === "PROFILE_REQUIRED") {
        setError(<>{errorMessage(err)} <Link href="/profile">Tạo hồ sơ</Link></>);
      } else {
        const a = uploadErrorAlert(err, file);
        setErrorTone(a.tone);
        setError(a.text);
        // AI bận: CV đã được lưu, nếu lấy lại được thì đi tiếp sang bước kiểm tra.
        if (a.tone === "warning") {
          try {
            const r = await aiApi.latestEnrichment(user.userId);
            if (r) { setState(r); if (!r.conversation) router.push("/onboarding/cv-review"); }
          } catch { /* giữ thông báo */ }
        }
      }
    } finally {
      setBusy(false);
      setPickedFile(null);
    }
  }

  // US-45 (PRD-CV-3) — skip = "Bỏ qua" câu hiện tại (không cần nhập gì)
  async function send(e: FormEvent | null, skip = false, quick?: string) {
    e?.preventDefault();
    const text = quick ?? answer;
    if ((!skip && !text.trim()) || !state?.conversation) return;
    setBusy(true);
    setError("");
    try {
      const conversation = await aiApi.answerEnrichment(state.conversation.id, skip ? "" : text, skip);
      setSkillHelp(conversation.assistantReply
        ? { conversationId: conversation.id, question: text.trim(), reply: conversation.assistantReply }
        : null);
      setState({ ...state, conversation });
      setAnswer("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const conv = state?.conversation ?? null;
  if (state === undefined) return <Loading />;
  const completed = conv?.status === "COMPLETED";
  const curSlot = conv ? (conv.currentQuestion ?? conv.messages.find((m) => !m.answer && !m.skipped))?.slot : undefined;
  const quick = curSlot ? QUICK_REPLIES[curSlot] ?? [] : [];

  const uploadCard = (
    <Card>
      <CardHeader title={state ? "Tải CV mới để bắt đầu lại" : "Tải CV của bạn"} description="PDF có lớp văn bản, tối đa 5 MB." />
      <CardBody className="flex flex-col gap-4">
        <CvConsent checked={consent} onChange={setConsent} audience="MENTEE" disabled={busy} />
      </CardBody>
      <CardFooter>
        {busy && pickedFile ? (
          <div className="flex w-full flex-col gap-4" aria-live="polite">
            <div className="ob-file-chip">
              <span className="ob-file-ico"><FileText aria-hidden="true" className="size-5" /></span>
              <div className="min-w-0 flex-1"><b className="break-all">{pickedFile.name}</b><div className="text-small text-ink-muted">{formatSize(pickedFile.size)}</div></div>
            </div>
            <ol className="ob-progress" aria-label="AI đang đọc CV">
              {READ_STEPS.map((t, i) => (
                <li key={t} data-state={i < phase ? "done" : i === phase ? "current" : "todo"}>
                  <span className="ob-dot">{i < phase ? <Check aria-hidden="true" /> : i === phase ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}</span>
                  {t}
                </li>
              ))}
            </ol>
            <p className="text-small text-ink-muted">Thường mất dưới 30 giây. Bạn có thể ở lại trang này.</p>
          </div>
        ) : (
          <div
            className="ob-drop w-full"
            data-over={over}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) upload(e.dataTransfer.files?.[0]); }}
          >
            <span className="ob-drop-ico"><Upload aria-hidden="true" /></span>
            <strong>Kéo thả CV vào đây</strong>
            <span className="text-small text-ink-muted">PDF có lớp văn bản, tối đa 5 MB</span>
            <label htmlFor="cv-file" className={`btn ${state ? "" : "btn-primary"} ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {busy ? "Đang tải và AI đọc…" : "Chọn tệp từ máy"}
            </label>
            <input id="cv-file" type="file" accept="application/pdf" className="sr-only" disabled={busy}
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        )}
      </CardFooter>
      {!conv && (
        <div className="ob-link-row pb-2">
          Chưa có CV? <Link href="/onboarding/manual">Điền thông tin thủ công</Link>
        </div>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="CV và mục tiêu"
        description="Tải CV, xem lại thông tin trích xuất, rồi trả lời vài câu hỏi để chatbot hiểu rõ mục tiêu học tập của bạn."
      />
      <Steps current={!state ? 0 : !conv ? 1 : completed ? 3 : 2} />
      <Alert tone={errorTone} className="mb-6">{error}</Alert>
      {(!state || (!conv && fresh)) && <div className="max-w-[720px]">{uploadCard}</div>}
      {state && !conv && !fresh && <Loading text="Đang chuyển sang bước kiểm tra thông tin…" />}
      {state && conv && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader
              title="Chatbot làm rõ mục tiêu"
              description={<>Trợ lý MentorHub dựa trên CV {state.cv.fileName}. Đã đọc CV nên chỉ hỏi thêm những gì CV chưa nói; trả lời ngắn gọn là đủ.</>}
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
              {skillHelp?.conversationId === conv.id && (
                <div className="chat" aria-live="polite">
                  <div className="bubble bubble-me">{skillHelp.question}</div>
                  <div className="bubble">{skillHelp.reply}</div>
                </div>
              )}
              <div ref={bottom} />
              {completed && <GoalDraft key={conv.id} conversation={conv} onChange={(conversation) => setState({ ...state, conversation })} />}
            </CardBody>
            {!completed && (
              <form onSubmit={send} className="card-foot flex-col items-stretch">
                {quick.length > 0 && (
                  <div className="ob-quick" role="group" aria-label="Gợi ý trả lời nhanh">
                    {quick.map((q) => (
                      <button key={q} type="button" className="ob-quick-btn" disabled={busy} onClick={() => send(null, false, q)}>{q}</button>
                    ))}
                    <button type="button" className="ob-quick-btn ob-quick-other" disabled={busy} onClick={() => answerBox.current?.focus()}>Trả lời khác…</button>
                  </div>
                )}
                <Textarea ref={answerBox} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Câu trả lời"
                  placeholder="Nhập câu trả lời…" maxLength={5000} disabled={busy} className="min-h-[88px]" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Link href="/onboarding/manual" className="btn btn-ghost" aria-label="Điền thủ công thay vì trò chuyện"><Pencil aria-hidden="true" />Điền thủ công thay vì trò chuyện</Link>
                  <Button variant="ghost" icon={SkipForward} disabled={busy} onClick={() => send(null, true)}>Bỏ qua câu này</Button>
                  <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!answer.trim()}>{busy ? "Đang xử lý…" : "Gửi"}</Button>
                </div>
              </form>
            )}
          </Card>
          <div className="flex min-w-0 flex-col gap-6">
            <LiveProfile cv={state.cv} conv={conv} />
            {!completed && <WhyAsk />}
            <ConfirmedCvCard cv={state.cv} />
            {uploadCard}
          </div>
        </div>
      )}
    </>
  );
}

export default function CvEnrichmentPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Suspense><Enrichment user={user} /></Suspense>}</RequireAuth>;
}
