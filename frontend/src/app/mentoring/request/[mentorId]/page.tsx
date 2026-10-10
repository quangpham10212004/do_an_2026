"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Send } from "lucide-react";
import { Alert, Avatar, Button, ButtonLink, Card, CardBody, CardFooter, Field, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
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

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Gửi yêu cầu mentoring" back={{ href: `/mentors/${mentorId}`, label: mentor.displayName }} />
      <form onSubmit={submit}>
        <Card>
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Avatar name={mentor.displayName} src={mentor.avatarUrl} />
            <div>
              <div className="font-semibold">{mentor.displayName}</div>
              <div className="text-small text-ink-muted">{domainLabel(mentor.domain)} · {formatRate(mentor.hourlyRate)}</div>
            </div>
          </div>
          <CardBody className="flex flex-col gap-5">
            <Alert>{error}</Alert>
            <Field label="Mục tiêu của bạn" id="goal" required
              error={goal.length > 0 && goal.length < GOAL_MIN ? `Cần thêm ${GOAL_MIN - goal.length} ký tự (tối thiểu ${GOAL_MIN}).` : undefined}
              hint={`${goal.length}/${GOAL_MAX} ký tự, tối thiểu ${GOAL_MIN}.`}>
              <Textarea id="goal" value={form.goal} maxLength={GOAL_MAX} required className="min-h-[120px]"
                placeholder="Bạn muốn đạt được gì khi học cùng mentor? Ví dụ: trở thành backend developer Java trong 6 tháng, nắm vững Spring Boot và thiết kế REST API."
                onChange={(e) => setForm({ ...form, goal: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Loại phiên chính" id="sessionType">
                <Select id="sessionType" value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value as SessionType })}>
                  {SESSION_TYPES.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
                </Select>
              </Field>
              <Field label="Tần suất mong muốn" id="frequency">
                <Select id="frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as RequestFrequency })}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </Select>
              </Field>
              <Field label="Thời gian dự kiến" id="duration">
                <Select id="duration" value={form.expectedDurationMonths}
                  onChange={(e) => setForm({ ...form, expectedDurationMonths: Number(e.target.value) as ExpectedDurationMonths })}>
                  {EXPECTED_DURATIONS.map((m) => <option key={m} value={m}>{m} tháng</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Lời nhắn cho mentor" id="message" hint="Không bắt buộc.">
              <Textarea id="message" value={form.message} maxLength={MESSAGE_MAX}
                placeholder="Giới thiệu ngắn về bạn hoặc câu hỏi cho mentor"
                onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </Field>
            <p className="text-small text-ink-muted">
              Mentor có 72 giờ để phản hồi; quá hạn, yêu cầu tự hết hạn và bạn nhận gợi ý mentor khác. Bạn có tối đa
              3 yêu cầu đang chờ phản hồi cùng lúc.
            </p>
          </CardBody>
          <CardFooter>
            <ButtonLink href={`/mentors/${mentorId}`} variant="ghost">Xem hồ sơ mentor</ButtonLink>
            <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!goalValid}>{busy ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

export default function SendRequestPage({ params }: { params: { mentorId: string } }) {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <SendRequest user={user} mentorId={params.mentorId} />}</RequireAuth>;
}
