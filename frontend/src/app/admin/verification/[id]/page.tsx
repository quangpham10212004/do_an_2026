"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Check, RotateCcw, X } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, DescriptionList, Field, FlashAlerts, Loading, PageHeader, StatusBadge, Textarea, type Flash } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { AssessmentCard, InterviewTranscript } from "@/features/ai/InterviewViews";
import { PlanCard } from "@/features/ai/VoiceViews";
import { VideoCard } from "@/features/ai/VideoCard";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Recommendation, Round1Decision, VerificationApplication } from "@/types";

const MIN_NOTE = 10;

/**
 * Bắt buộc ghi chú (≥ 10 ký tự) khi RETAKE, hoặc khi quyết định ngược khuyến nghị AI (giống rubric.note_required ở ai-service):
 * PASS khi AI = REJECT, REJECT khi AI = APPROVE; AI = NEEDS_REVIEW => chỉ RETAKE bắt buộc.
 */
function noteRequired(decision: Round1Decision, recommendation: Recommendation | null): boolean {
  if (decision === "RETAKE") return true;
  if (recommendation !== "APPROVE" && recommendation !== "REJECT") return false;
  return (decision === "PASS" ? "APPROVE" : "REJECT") !== recommendation;
}

function ApplicationReview({ id }: { id: string }) {
  const [app, setApp] = useState<VerificationApplication | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Flash>({});

  useEffect(() => {
    aiApi.adminApplication(id).then(setApp).catch((e) => { setMsg({ error: errorMessage(e) }); setApp(null); });
  }, [id]);

  async function decide(decision: Round1Decision) {
    setMsg({});
    try {
      if (app?.interview && noteRequired(decision, app.interview.recommendation) && note.trim().length < MIN_NOTE) {
        setMsg({ error: `Cần ghi rõ lý do (ít nhất ${MIN_NOTE} ký tự) khi yêu cầu làm lại hoặc quyết định khác khuyến nghị của AI.` });
        return;
      }
      setApp(await aiApi.round1Review(id, decision, note));
      setMsg({ ok: decision === "PASS" ? "Đã cho mentor qua vòng 1." : decision === "REJECT" ? "Đã từ chối mentor, mentor chờ 15 ngày để xác thực lại." : "Đã yêu cầu mentor làm lại vòng 1 (không tính vào số lần làm)." });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  if (app === undefined) return <Loading />;
  if (!app) return <Alert>{msg.error}</Alert>;
  const interview = app.interview;
  const retakeLeft = app.retakeLimit - app.retakeCount;
  const star = (d: Round1Decision) => (interview && noteRequired(d, interview.recommendation) ? " *" : "");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/verification", label: "Duyệt mentor" }}
        title={`Xác thực mentor · ${app.mentorName || "Mentor"}`}
        description={interview ? `${interview.domain} · ${interview.skills.join(", ")}` : undefined}
        actions={<><Badge>Vòng 1 · Giọng nói</Badge><StatusBadge status={app.status} /></>}
      />
      <FlashAlerts flash={msg} className="mb-6" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Toàn bộ hội thoại" description={app.interviews.length > 1 ? `Buổi mới nhất trong ${app.interviews.length} lần làm vòng 1` : undefined} />
          <CardBody>{interview ? <InterviewTranscript interview={interview} admin /> : <p className="text-ink-muted">Mentor chưa làm vòng 1.</p>}</CardBody>
        </Card>
        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20">
          {app.status === "ROUND1_REVIEW" && (
            <Card>
              <CardHeader title="Duyệt vòng 1"
                description="Đọc kỹ bản chép lời, AI có thể chấm sai. Mentor chỉ xuất hiện trong AI Matching sau khi được kích hoạt." />
              <CardBody className="flex flex-col gap-3">
                <Field label="Nhận xét gửi mentor" id="review-note"
                  hint={`Bắt buộc (từ ${MIN_NOTE} ký tự) khi yêu cầu làm lại hoặc quyết định ngược khuyến nghị AI.`}>
                  <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                </Field>
                <p className="text-small text-ink-muted">
                  * cần nhận xét. “Yêu cầu làm lại” không tính vào số lần làm, còn {Math.max(0, retakeLeft)}/{app.retakeLimit} lần. “Từ chối” đóng đợt, mentor chờ 15 ngày.
                </p>
              </CardBody>
              <CardFooter>
                <Button icon={RotateCcw} onClick={() => decide("RETAKE")} disabled={retakeLeft <= 0}>Yêu cầu làm lại{star("RETAKE")}</Button>
                <Button variant="danger" icon={X} onClick={() => decide("REJECT")}>Từ chối{star("REJECT")}</Button>
                <Button variant="primary" icon={Check} onClick={() => decide("PASS")}>Cho qua vòng 1{star("PASS")}</Button>
              </CardFooter>
            </Card>
          )}
          {interview && <AssessmentCard interview={interview} />}
          {interview?.video && (
            <VideoCard interview={interview} admin
              onChange={(video) => setApp((cur) => cur && cur.interview ? { ...cur, interview: { ...cur.interview, video } } : cur)} />
          )}
          {interview?.plan && <PlanCard plan={interview.plan} description="AI soạn từ hồ sơ và CV của mentor (nếu mentor đồng ý gửi AI bên ngoài); chủ đề mentoring luôn lấy từ ngân hàng câu hỏi." />}
          <Card>
            <CardHeader title="Đợt xác thực" />
            <CardBody>
              <DescriptionList items={[
                ["Bắt đầu", formatDateTime(app.createdAt)],
                ["Lần làm không hợp lệ", `${app.attemptsUsed}/${app.maxAttempts}`],
                ["Admin yêu cầu làm lại", `${app.retakeCount}/${app.retakeLimit}`],
                ...(app.round1ReviewedAt ? [["Duyệt vòng 1", `${formatDateTime(app.round1ReviewedAt)} (${app.round1Decision})`] as [string, string]] : []),
                ...(app.round1Note ? [["Nhận xét", app.round1Note] as [string, string]] : []),
                ...(app.retryAfter ? [["Được xác thực lại từ", formatDateTime(app.retryAfter)] as [string, string]] : []),
              ]} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminVerificationDetailPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <ApplicationReview id={params.id} />
    </RequireAuth>
  );
}
