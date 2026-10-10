"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, Button, ButtonLink, Card, CardBody, CardHeader, DescriptionList, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { AGENDA_MAX, AGENDA_MIN, SESSION_DURATIONS, SESSION_TYPES, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { formatDateTime, formatMoney, formatRate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { IsoDateTime, MentorProfile, MentoringRequest, SessionDuration, SessionType, SessionUser } from "@/types";

interface BookingForm {
  scheduledAt: IsoDateTime | null;
  durationMinutes: SessionDuration;
  sessionType: SessionType;
  agenda: string;
  preReadLink: string;
}

const INITIAL: BookingForm = { scheduledAt: null, durationMinutes: 60, sessionType: "CAREER_ADVICE", agenda: "", preReadLink: "" };

/** US-03 / US-05 — form đặt lịch phiên mentoring (PRD-SES-1, PRD-SES-2). */
function BookSession({ user, mentorId }: { user: SessionUser; mentorId: string }) {
  const router = useRouter();
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [request, setRequest] = useState<MentoringRequest | null | undefined>(undefined);
  const [form, setForm] = useState<BookingForm>(INITIAL);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pickSlot = useCallback((scheduledAt: IsoDateTime | null) => setForm((f) => ({ ...f, scheduledAt })), []);

  useEffect(() => {
    profileApi.getMentor(mentorId).then(setMentor).catch(() => setMentor(null));
    mentoringApi.requests()
      .then((rs) => setRequest(rs.find((r) => r.mentorId === mentorId && r.status === "ACCEPTED") || null))
      .catch(() => setRequest(null));
  }, [mentorId]);

  const agenda = form.agenda.trim();
  const agendaValid = agenda.length >= AGENDA_MIN && agenda.length <= AGENDA_MAX;
  const linkValid = !form.preReadLink.trim() || /^https?:\/\/\S+$/i.test(form.preReadLink.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.scheduledAt || !agendaValid || !linkValid) return;
    setBusy(true);
    setError("");
    try {
      const session = await mentoringApi.bookSession({
        menteeId: user.userId,
        mentorId,
        scheduledAt: form.scheduledAt,
        durationMinutes: form.durationMinutes,
        sessionType: form.sessionType,
        agenda,
        preReadLink: form.preReadLink.trim() || undefined,
      });
      if (session.status === "PENDING") router.push(`/payment/${session.id}`);
      else router.push("/mentoring/sessions?booked=1");
    } catch (err) {
      setError(errorMessage(err));
      setSlotsVersion((v) => v + 1); // khung giờ có thể vừa bị người khác đặt → tải lại
    } finally {
      setBusy(false);
    }
  }

  if (mentor === undefined || request === undefined) return <Loading />;
  if (!mentor) return <Alert action={<ButtonLink href="/mentors" size="sm">Danh sách mentor</ButtonLink>}>Không tìm thấy mentor này.</Alert>;
  if (!request) {
    return (
      <Alert tone="info" action={<ButtonLink href={`/mentoring/request/${mentorId}`} size="sm" variant="primary">Gửi yêu cầu</ButtonLink>}>
        Bạn cần được {mentor.displayName} chấp nhận yêu cầu mentoring trước khi đặt lịch.
      </Alert>
    );
  }
  const price = Math.round((Number(mentor.hourlyRate) * form.durationMinutes) / 60 / 1000) * 1000;
  const ready = !!form.scheduledAt && agendaValid && linkValid;

  return (
    <>
      <PageHeader title="Đặt lịch phiên mentoring" back={{ href: `/mentors/${mentorId}`, label: mentor.displayName }} />
      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Alert>{error}</Alert>
          <Card>
            <CardHeader title="Chọn thời gian" />
            <CardBody className="flex flex-col gap-5">
              <div className="form-grid">
                <Field label="Thời lượng" id="duration">
                  <Select id="duration" value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) as SessionDuration })}>
                    {SESSION_DURATIONS.map((d) => <option key={d} value={d}>{d} phút</option>)}
                  </Select>
                </Field>
                <Field label="Loại phiên" id="sessionType">
                  <Select id="sessionType" value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value as SessionType })}>
                    {SESSION_TYPES.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
                  </Select>
                </Field>
              </div>
              <SlotPicker mentorId={mentorId} durationMinutes={form.durationMinutes} value={form.scheduledAt} onChange={pickSlot} refreshKey={slotsVersion} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Nội dung phiên" />
            <CardBody className="flex flex-col gap-5">
              <Field label="Agenda" id="agenda" required
                error={agenda.length > 0 && agenda.length < AGENDA_MIN ? `Cần thêm ${AGENDA_MIN - agenda.length} ký tự (tối thiểu ${AGENDA_MIN}).` : undefined}
                hint={`${agenda.length}/${AGENDA_MAX} ký tự, tối thiểu ${AGENDA_MIN}.`}>
                <Textarea id="agenda" value={form.agenda} maxLength={AGENDA_MAX} required
                  placeholder="Bạn muốn trao đổi gì trong phiên này? Ví dụ: review kiến trúc REST API của dự án quản lý kho"
                  onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
              </Field>
              <Field label="Tài liệu đọc trước" id="preRead" hint="Không bắt buộc."
                error={linkValid ? undefined : "Link phải bắt đầu bằng http:// hoặc https://"}>
                <Input id="preRead" type="url" value={form.preReadLink} maxLength={500} placeholder="https://github.com/…"
                  onChange={(e) => setForm({ ...form, preReadLink: e.target.value })} />
              </Field>
            </CardBody>
          </Card>
        </div>
        <Card className="lg:sticky lg:top-20">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Avatar name={mentor.displayName} src={mentor.avatarUrl} />
            <div className="min-w-0">
              <div className="font-semibold">{mentor.displayName}</div>
              <div className="text-small text-ink-muted">{formatRate(mentor.hourlyRate)}</div>
            </div>
          </div>
          <CardBody className="flex flex-col gap-4">
            <DescriptionList items={[
              ["Thời gian", form.scheduledAt ? formatDateTime(form.scheduledAt) : <span key="t" className="text-ink-subtle">Chưa chọn</span>],
              ["Thời lượng", `${form.durationMinutes} phút`],
              ["Loại phiên", SESSION_TYPE_LABELS[form.sessionType]],
            ]} />
            <hr className="divider" />
            <div className="flex items-baseline justify-between">
              <span className="text-ink-muted">Chi phí</span>
              <span className="font-mono text-title-2 font-medium tabular">{formatMoney(price)}</span>
            </div>
            <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!ready}>
              {busy ? "Đang kiểm tra lịch…" : price > 0 ? "Xác nhận và thanh toán" : "Xác nhận đặt lịch"}
            </Button>
            {!form.scheduledAt && <p className="text-center text-small text-ink-muted">Chọn một khung giờ để tiếp tục.</p>}
          </CardBody>
        </Card>
      </form>
    </>
  );
}

export default function BookSessionPage({ params }: { params: { mentorId: string } }) {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <BookSession user={user} mentorId={params.mentorId} />}</RequireAuth>;
}
