"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { BadgeCheck, Send } from "lucide-react";
import { Alert, Button, ButtonLink, Loading, Textarea } from "@/components/ui";
import { FlowChoice, FlowHead, FlowPill, FlowTile } from "@/features/mentoring/FlowKit";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import { EXPECTED_DURATIONS, FREQUENCIES, GOAL_MAX, GOAL_MIN, SESSION_TYPES, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { formatMoney, formatRate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { ExpectedDurationMonths, MentorProfile, MentoringRequest, RequestFrequency, SessionType, SessionUser } from "@/types";

interface RequestForm {
  goal: string;
  sessionType: SessionType;
  frequency: RequestFrequency;
  expectedDurationMonths: ExpectedDurationMonths;
  message: string;
}

const MESSAGE_MAX = 1000;
/** Mentor có 72 giờ để phản hồi (backend US-15); bản thiết kế ghi 48 giờ. */
const RESPONSE_HOURS = 72;
const TRIAL_PRICE = 30_000;

/** Nhãn tần suất theo bản thiết kế (khoá enum giữ nguyên). */
const FREQ_CHOICE_LABELS: Record<RequestFrequency, string> = {
  WEEKLY: "1 buổi / tuần",
  BIWEEKLY: "2 tuần / lần",
  MONTHLY: "Hằng tháng",
  ONE_OFF: "Khi cần",
};

/** US-14 (PRD-REQ-1) — form gửi yêu cầu mentoring; goal điền sẵn từ hồ sơ mentee. */
function SendRequest({ user, mentorId }: { user: SessionUser; mentorId: string }) {
  const router = useRouter();
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [open, setOpen] = useState<MentoringRequest | null | undefined>(undefined);
  const [form, setForm] = useState<RequestForm>({ goal: "", sessionType: "CAREER_ADVICE", frequency: "WEEKLY", expectedDurationMonths: 3, message: "" });
  const [profileGoal, setProfileGoal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    profileApi.getMentor(mentorId).then(setMentor).catch(() => setMentor(null));
    mentoringApi.requests()
      .then((rs) => setOpen(rs.find((r) => r.mentorId === mentorId && (r.status === "PENDING" || r.status === "ACCEPTED")) || null))
      .catch(() => setOpen(null));
    // Goal điền sẵn từ hồ sơ mentee (chưa có hồ sơ → để trống)
    profileApi.getMentee(user.userId)
      .then((p) => {
        const g = (p.goal || "").slice(0, GOAL_MAX);
        setProfileGoal(g);
        setForm((f) => (f.goal ? f : { ...f, goal: g }));
      })
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
  if (!mentor) return <Alert action={<ButtonLink href="/mentors" size="sm">Danh sách mentor</ButtonLink>}>Không tìm thấy mentor này.</Alert>;
  if (open) {
    return (
      <Alert tone="info" action={<div className="flex gap-2">
        <ButtonLink href="/mentoring/requests" size="sm">Xem yêu cầu</ButtonLink>
        {open.status === "ACCEPTED" && <ButtonLink href={`/mentoring/book/${mentorId}`} size="sm" variant="primary">Đặt lịch</ButtonLink>}
      </div>}>
        Bạn đã có yêu cầu {open.status === "PENDING" ? "đang chờ" : "được chấp nhận"} với {mentor.displayName}.
      </Alert>
    );
  }

  const slotsLeft = Math.max(mentor.capacity - mentor.activeMenteeCount, 0);
  const goalHint = goal.length > 0 && goal.length < GOAL_MIN ? `Cần thêm ${GOAL_MIN - goal.length} ký tự (tối thiểu ${GOAL_MIN}).` : "";

  return (
    <div className="fl-page">
      <FlowHead back={{ href: `/mentors/${mentorId}`, label: mentor.displayName }} step={0} title="Gửi yêu cầu mentoring"
        lead={`Mentor cần chấp nhận trước khi bạn đặt lịch. Yêu cầu hết hạn sau ${RESPONSE_HOURS} giờ nếu chưa có phản hồi.`} />
      <div className="fl-layout">
        <form className="fl-panel" style={{ flex: "999 1 560px", minWidth: 0 }} onSubmit={submit}>
          <div className="fl-panel-body">
            <Alert>{error}</Alert>
            <div className="fl-group" style={{ gap: 8 }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor="goal" className="fl-group-label">Mục tiêu của bạn *</label>
                {profileGoal && profileGoal !== form.goal && (
                  <button type="button" className="fl-link" onClick={() => setForm({ ...form, goal: profileGoal })}>Dùng mục tiêu trong hồ sơ</button>
                )}
              </div>
              <Textarea id="goal" value={form.goal} maxLength={GOAL_MAX} required rows={5} className="min-h-[120px]" aria-describedby="goal-count"
                placeholder="Bạn muốn đạt được gì khi học cùng mentor? Ví dụ: trở thành backend developer Java trong 6 tháng, nắm vững Spring Boot và thiết kế REST API."
                onChange={(e) => setForm({ ...form, goal: e.target.value })} />
              <div className="flex flex-wrap justify-between gap-2">
                <span className="fl-err" role={goalHint ? "alert" : undefined}>{goalHint}</span>
                <span id="goal-count" className="fl-count">{goal.length} / {GOAL_MAX} ký tự (tối thiểu {GOAL_MIN})</span>
              </div>
            </div>
            <div className="fl-group">
              <div className="fl-group-label" id="lbl-type">Loại phiên chính</div>
              <FlowChoice label="Loại phiên chính" value={form.sessionType} onChange={(sessionType) => setForm({ ...form, sessionType })}
                options={SESSION_TYPES.map((t) => ({ id: t, label: SESSION_TYPE_LABELS[t] }))} />
            </div>
            <div className="fl-cols">
              <div className="fl-group">
                <div className="fl-group-label">Tần suất mong muốn</div>
                <FlowChoice label="Tần suất mong muốn" value={form.frequency} onChange={(frequency) => setForm({ ...form, frequency })}
                  options={FREQUENCIES.map((f) => ({ id: f, label: FREQ_CHOICE_LABELS[f] }))} />
              </div>
              <div className="fl-group">
                <div className="fl-group-label">Thời gian dự kiến</div>
                <FlowChoice label="Thời gian dự kiến" value={form.expectedDurationMonths} onChange={(expectedDurationMonths) => setForm({ ...form, expectedDurationMonths })}
                  options={EXPECTED_DURATIONS.map((m) => ({ id: m, label: `${m} tháng` }))} />
              </div>
            </div>
            <div className="fl-group" style={{ gap: 8 }}>
              <label htmlFor="message" className="fl-group-label">Lời nhắn cho mentor <small>(không bắt buộc)</small></label>
              <Textarea id="message" value={form.message} maxLength={MESSAGE_MAX} rows={3}
                placeholder="Giới thiệu ngắn về bạn hoặc câu hỏi cho mentor"
                onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
          </div>
          <div className="fl-panel-foot">
            <ButtonLink href={`/mentors/${mentorId}`}>Huỷ</ButtonLink>
            <Button type="submit" variant="primary" size="lg" icon={Send} loading={busy} disabled={!goalValid}>{busy ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
          </div>
        </form>

        <aside className="fl-aside" aria-label="Thông tin mentor">
          <section className="fl-panel" style={{ overflow: "hidden" }}>
            <div style={{ height: 56, background: "linear-gradient(120deg, color-mix(in srgb, var(--accent) 25%, var(--surface)), color-mix(in srgb, var(--accent) 70%, var(--surface)))" }} />
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ marginTop: -32 }}><FlowTile name={mentor.displayName} src={mentor.avatarUrl} size="lg" /></div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <b style={{ fontSize: 16 }}>{mentor.displayName}</b>
                {mentor.verificationStatus === "APPROVED" && <FlowPill tone="success"><BadgeCheck size={12} aria-hidden="true" />&nbsp;Xác thực</FlowPill>}
              </div>
              {mentor.headline && <div className="fl-req-sub">{mentor.headline}</div>}
              <div className="mt-2.5 text-small text-ink-muted">
                <b className="text-accent-ink">★ {Number(mentor.rating).toFixed(1)}</b> ({mentor.ratingCount}) · <b className="text-ink">{formatRate(mentor.hourlyRate)}</b>
              </div>
              <div className="mt-1.5 text-[12px] text-accent-ink">
                {mentor.isAvailable ? `● Đang nhận · còn ${slotsLeft} chỗ` : "Tạm thời chưa nhận mentee mới"}
              </div>
            </div>
          </section>
          <section className="fl-panel fl-side">
            <h2>Sau khi gửi yêu cầu</h2>
            <ol className="fl-steps-list">
              <li>Mentor xem và trả lời trong {RESPONSE_HOURS} giờ.</li>
              <li>Được chấp nhận, bạn chọn khung giờ và đặt lịch.</li>
              <li>Học phí được giữ từ ví, chỉ chuyển cho mentor khi buổi học xong.</li>
            </ol>
          </section>
          {mentor.trialEnabled && (
            <section className="fl-note">
              <b>Muốn thử trước?</b> Học thử 15 phút ({formatMoney(TRIAL_PRICE)}), không cần mentor chấp nhận.{" "}
              <Link href={`/mentoring/book/${mentorId}?trial=1`}>Đặt buổi thử →</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function SendRequestPage({ params }: { params: { mentorId: string } }) {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <SendRequest user={user} mentorId={params.mentorId} />}</RequireAuth>;
}
