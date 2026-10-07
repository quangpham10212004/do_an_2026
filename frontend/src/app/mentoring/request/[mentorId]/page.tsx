"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import {
  EXPECTED_DURATIONS,
  FREQUENCIES,
  FREQUENCY_LABELS,
  GOAL_MAX,
  GOAL_MIN,
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
} from "@/features/mentoring/labels";
import { formatRate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type {
  ExpectedDurationMonths,
  MentorProfile,
  MentoringRequest,
  RequestFrequency,
  SessionType,
  SessionUser,
} from "@/types";

interface RequestForm {
  goal: string;
  sessionType: SessionType;
  frequency: RequestFrequency;
  expectedDurationMonths: ExpectedDurationMonths;
  message: string;
}

const MESSAGE_MAX = 1000;

/** US-14 (PRD-REQ-1) — form gửi yêu cầu mentoring; goal điền sẵn từ hồ sơ mentee. */
function SendRequest({ user, mentorId }: { user: SessionUser; mentorId: string }) {
  const router = useRouter();
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [open, setOpen] = useState<MentoringRequest | null | undefined>(undefined);
  const [form, setForm] = useState<RequestForm>({ goal: "", sessionType: "CAREER_ADVICE", frequency: "WEEKLY", expectedDurationMonths: 3, message: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    profileApi.getMentor(mentorId).then(setMentor).catch(() => setMentor(null));
    mentoringApi.requests()
      .then((rs) => setOpen(rs.find((r) => r.mentorId === mentorId && (r.status === "PENDING" || r.status === "ACCEPTED")) || null))
      .catch(() => setOpen(null));
    // Goal điền sẵn từ hồ sơ mentee (chưa có hồ sơ → để trống)
    profileApi.getMentee(user.userId)
      .then((p) => setForm((f) => (f.goal ? f : { ...f, goal: (p.goal || "").slice(0, GOAL_MAX) })))
      .catch(() => {});
  }, [mentorId, user.userId]);

  const goal = form.goal.trim();
  const goalValid = goal.length >= GOAL_MIN && goal.length <= GOAL_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!goalValid) return;
    setBusy(true);
    setError("");
    try {
      await mentoringApi.sendRequest({
        mentorId,
        goal,
        sessionType: form.sessionType,
        frequency: form.frequency,
        expectedDurationMonths: form.expectedDurationMonths,
        message: form.message.trim() || undefined,
      });
      router.push("/mentoring/requests?sent=1");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (mentor === undefined || open === undefined) return <Loading />;
  if (!mentor) return <Alert>Không tìm thấy mentor. <Link href="/mentors">Xem danh sách mentor</Link></Alert>;
  if (open) {
    return (
      <Alert type="info">
        Bạn đã có yêu cầu {open.status === "PENDING" ? "đang chờ" : "được chấp nhận"} với {mentor.displayName}.{" "}
        <Link href="/mentoring/requests">Xem yêu cầu</Link>
        {open.status === "ACCEPTED" && <> · <Link href={`/mentoring/book/${mentorId}`}>Đặt lịch</Link></>}
      </Alert>
    );
  }

  return (
    <>
      <PageHead title={`Gửi yêu cầu tới ${mentor.displayName}`} subtitle={`${mentor.domain} · ${formatRate(mentor.hourlyRate)}`} />
      <Alert>{error}</Alert>
      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="goal">Mục tiêu của bạn <span className="muted small">(bắt buộc, {GOAL_MIN}–{GOAL_MAX} ký tự)</span></label>
          <textarea id="goal" value={form.goal} maxLength={GOAL_MAX} required style={{ minHeight: 110 }}
            placeholder="Bạn muốn đạt được gì khi học cùng mentor? Ví dụ: trở thành backend developer Java trong 6 tháng, nắm vững Spring Boot và thiết kế REST API."
            onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          <span className="small muted" style={goalValid || !goal ? undefined : { color: "var(--danger, #c92a2a)" }}>
            {goal.length}/{GOAL_MAX}{goal.length > 0 && goal.length < GOAL_MIN ? ` — cần thêm ${GOAL_MIN - goal.length} ký tự` : ""}
          </span>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="sessionType">Loại phiên chính</label>
            <select id="sessionType" value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value as SessionType })}>
              {SESSION_TYPES.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="frequency">Tần suất mong muốn</label>
            <select id="frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as RequestFrequency })}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="duration">Thời gian dự kiến</label>
          <select id="duration" value={form.expectedDurationMonths}
            onChange={(e) => setForm({ ...form, expectedDurationMonths: Number(e.target.value) as ExpectedDurationMonths })}>
            {EXPECTED_DURATIONS.map((m) => <option key={m} value={m}>{m} tháng</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="message">Lời nhắn cho mentor <span className="muted small">(tuỳ chọn)</span></label>
          <textarea id="message" value={form.message} maxLength={MESSAGE_MAX}
            placeholder="Giới thiệu ngắn về bạn hoặc câu hỏi cho mentor"
            onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
        <p className="small muted">
          Bạn có thể có tối đa 3 yêu cầu đang chờ phản hồi cùng lúc.
        </p>
        <div className="row">
          <button className="btn" disabled={busy || !goalValid}>{busy ? "Đang gửi..." : "Gửi yêu cầu"}</button>
          <Link href={`/mentors/${mentorId}`} className="btn secondary">Xem hồ sơ mentor</Link>
        </div>
      </form>
    </>
  );
}

export default function SendRequestPage({ params }: { params: { mentorId: string } }) {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <SendRequest user={user} mentorId={params.mentorId} />}</RequireAuth>;
}
