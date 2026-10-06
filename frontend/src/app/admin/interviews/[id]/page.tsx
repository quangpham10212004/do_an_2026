"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge, Flash } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { AssessmentCard, InterviewTranscript } from "@/features/ai/InterviewViews";
import { errorMessage } from "@/lib/api";
import type { Interview, ReviewDecision } from "@/types";

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
      setInterview(await aiApi.reviewInterview(id, decision, note));
      setMsg({ ok: decision === "APPROVE" ? "Đã kích hoạt mentor." : "Đã từ chối mentor." });
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
          <InterviewTranscript interview={interview} />
        </div>
        <div className="stack">
          <AssessmentCard interview={interview} />
          {interview.status === "PENDING_REVIEW" && (
            <div className="card">
              <h2>Quyết định của quản trị viên</h2>
              <p className="muted small">Hãy đọc kỹ câu trả lời — AI có thể chấm sai. Mentor chỉ xuất hiện trong kết quả AI Matching sau khi được duyệt.</p>
              <div className="field"><label>Nhận xét gửi mentor</label><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
              <div className="row">
                <button className="btn good" onClick={() => decide("APPROVE")}>Duyệt & kích hoạt</button>
                <button className="btn danger" onClick={() => decide("REJECT")}>Từ chối</button>
              </div>
            </div>
          )}
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
