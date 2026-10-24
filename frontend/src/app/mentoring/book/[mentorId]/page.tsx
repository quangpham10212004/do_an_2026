"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, Button, ButtonLink, Card, CardBody, CardHeader, DescriptionList, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { AGENDA_MAX, AGENDA_MIN, SESSION_TYPES, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { MOCK_LEVELS, MOCK_LEVEL_LABELS, MOCK_TYPES, MOCK_TYPE_LABELS } from "@/features/mentoring/mockLabels";
import { formatDateTime, formatMoney, formatRate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { IsoDateTime, MentorProfile, MentoringRequest, MockIntakeInput, SessionDuration, SessionType, SessionUser } from "@/types";

interface BookingForm {
  scheduledAt: IsoDateTime | null;
  durationMinutes: SessionDuration;
  sessionType: SessionType;
  agenda: string;
  preReadLink: string;
  referralCode: string;
  /** US-58 — chỉ gửi khi sessionType = MOCK_INTERVIEW. */
  mock: Required<Omit<MockIntakeInput, "targetCompany" | "interviewDate" | "jdUrl">> & { targetCompany: string; interviewDate: string; jdUrl: string };
}

const INITIAL: BookingForm = {
  scheduledAt: null, durationMinutes: 60, sessionType: "CAREER_ADVICE", agenda: "", preReadLink: "", referralCode: "",
  mock: { interviewType: "BACKEND", level: "FRESHER", targetRole: "", targetCompany: "", interviewDate: "", jdUrl: "" },
};
const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v);

/** US-03 / US-05 — form đặt lịch phiên mentoring (PRD-SES-1, PRD-SES-2). */
function BookSession({ user, mentorId }: { user: SessionUser; mentorId: string }) {
  const router = useRouter();
  const trial = useSearchParams().get("trial") === "1";   // Bản chốt v2.0 §10 — buổi trải nghiệm 15 phút, không cần quan hệ mentoring
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [request, setRequest] = useState<MentoringRequest | null | undefined>(undefined);
  const [form, setForm] = useState<BookingForm>({ ...INITIAL, durationMinutes: trial ? 15 : 60 });
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pickSlot = useCallback((scheduledAt: IsoDateTime | null) => setForm((f) => ({ ...f, scheduledAt })), []);

  useEffect(() => {
    profileApi.getMentor(mentorId).then(setMentor).catch(() => setMentor(null));
    if (trial) setRequest(null);
    else {
      mentoringApi.requests()
        .then((rs) => setRequest(rs.find((r) => r.mentorId === mentorId && r.status === "ACCEPTED") || null))
        .catch(() => setRequest(null));
    }
  }, [mentorId, trial]);

  const agenda = form.agenda.trim();
  const agendaValid = agenda.length >= AGENDA_MIN && agenda.length <= AGENDA_MAX;
  const linkValid = !form.preReadLink.trim() || isHttpUrl(form.preReadLink.trim());
  const isMock = form.sessionType === "MOCK_INTERVIEW";
  const role = form.mock.targetRole.trim();
  const jdValid = !form.mock.jdUrl.trim() || isHttpUrl(form.mock.jdUrl.trim());
  const mockValid = !isMock || (role.length >= 2 && role.length <= 120 && jdValid);
  const setMock = (patch: Partial<BookingForm["mock"]>) => setForm((f) => ({ ...f, mock: { ...f.mock, ...patch } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.scheduledAt || !agendaValid || !linkValid || !mockValid) return;
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
        kind: trial ? "TRIAL" : "REGULAR",
        referralCode: !trial && form.referralCode.trim() ? form.referralCode.trim().toUpperCase() : undefined,
        mockIntake: isMock ? {
          interviewType: form.mock.interviewType,
          level: form.mock.level,
          targetRole: role,
          targetCompany: form.mock.targetCompany.trim() || undefined,
          interviewDate: form.mock.interviewDate || undefined,
          jdUrl: form.mock.jdUrl.trim() || undefined,
        } : undefined,
      });
      // Ví đủ tiền → học phí đã được tạm giữ (AWAITING_MENTOR, chờ mentor xác nhận); thiếu tiền → trang nạp ví / thanh toán
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
  if (!request && !trial) {
    return (
      <Alert tone="info" action={<ButtonLink href={`/mentoring/request/${mentorId}`} size="sm" variant="primary">Gửi yêu cầu</ButtonLink>}>
        Bạn cần được {mentor.displayName} chấp nhận yêu cầu mentoring trước khi đặt lịch.
      </Alert>
    );
  }
  const price = trial ? 30_000 : Number(mentor.hourlyRate);   // Bản chốt v2.0: buổi thường cố định 60 phút (giá theo cấp), trải nghiệm 15 phút 30.000đ
  const ready = !!form.scheduledAt && agendaValid && linkValid && mockValid;

  return (
    <>
      <PageHeader title={trial ? "Đặt buổi trải nghiệm 15 phút" : "Đặt lịch phiên mentoring"} back={{ href: `/mentors/${mentorId}`, label: mentor.displayName }} />
      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Alert>{error}</Alert>
          <Card>
            <CardHeader title="Chọn thời gian" />
            <CardBody className="flex flex-col gap-5">
              <div className="form-grid">
                <Field label="Loại phiên" id="sessionType">
                  <Select id="sessionType" value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value as SessionType })}>
                    {SESSION_TYPES.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
                  </Select>
                </Field>
              </div>
              <SlotPicker mentorId={mentorId} durationMinutes={form.durationMinutes} value={form.scheduledAt} onChange={pickSlot} refreshKey={slotsVersion} />
            </CardBody>
          </Card>
          {isMock && (
            <Card>
              <CardHeader title="Thông tin phỏng vấn thử" description="Mentor dùng thông tin này để chuẩn bị câu hỏi sát với buổi phỏng vấn thật của bạn." />
              <CardBody className="flex flex-col gap-5">
                <div className="form-grid">
                  <Field label="Dạng phỏng vấn" id="mockType" required>
                    <Select id="mockType" value={form.mock.interviewType} onChange={(e) => setMock({ interviewType: e.target.value as MockIntakeInput["interviewType"] })}>
                      {MOCK_TYPES.map((t) => <option key={t} value={t}>{MOCK_TYPE_LABELS[t]}</option>)}
                    </Select>
                  </Field>
                  <Field label="Cấp độ" id="mockLevel" required>
                    <Select id="mockLevel" value={form.mock.level} onChange={(e) => setMock({ level: e.target.value as MockIntakeInput["level"] })}>
                      {MOCK_LEVELS.map((l) => <option key={l} value={l}>{MOCK_LEVEL_LABELS[l]}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Vị trí ứng tuyển" id="mockRole" required
                    error={role.length === 1 ? "Tối thiểu 2 ký tự." : undefined}>
                    <Input id="mockRole" value={form.mock.targetRole} maxLength={120} required placeholder="Backend Java Fresher"
                      onChange={(e) => setMock({ targetRole: e.target.value })} />
                  </Field>
                  <Field label="Công ty" id="mockCompany" hint="Không bắt buộc.">
                    <Input id="mockCompany" value={form.mock.targetCompany} maxLength={120} placeholder="FPT Software"
                      onChange={(e) => setMock({ targetCompany: e.target.value })} />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Ngày phỏng vấn thật" id="mockDate" hint="Không bắt buộc.">
                    <Input id="mockDate" type="date" value={form.mock.interviewDate} min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setMock({ interviewDate: e.target.value })} />
                  </Field>
                  <Field label="Link mô tả công việc (JD)" id="mockJd" hint="Không bắt buộc."
                    error={jdValid ? undefined : "Link phải bắt đầu bằng http:// hoặc https://"}>
                    <Input id="mockJd" type="url" value={form.mock.jdUrl} maxLength={500} placeholder="https://…"
                      onChange={(e) => setMock({ jdUrl: e.target.value })} />
                  </Field>
                </div>
              </CardBody>
            </Card>
          )}
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
              {!trial && (
                <Field label="Mã giới thiệu" id="referral" hint="Không bắt buộc. Chỉ dùng được ở buổi học đầu tiên với mentor này, không được giảm giá; người giới thiệu nhận thưởng sau khi buổi học hoàn thành.">
                  <Input id="referral" value={form.referralCode} maxLength={20} placeholder="VD: K7M2X9QA" className="font-mono uppercase"
                    onChange={(e) => setForm({ ...form, referralCode: e.target.value })} />
                </Field>
              )}
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
              {busy ? "Đang kiểm tra lịch…" : "Đặt lịch và tạm giữ học phí từ ví"}
            </Button>
            {!form.scheduledAt && <p className="text-center text-small text-ink-muted">Chọn một khung giờ để tiếp tục.</p>}
            <p className="text-small text-ink-muted">Học phí được tạm giữ từ ví ngay khi đặt. Mentor xác nhận trong 24 giờ; nếu không xác nhận hoặc từ chối, bạn được hoàn 100%.{" "}
              {trial ? "Buổi trải nghiệm: huỷ trước 2 giờ hoàn 100%, dưới 2 giờ không hoàn." : "Huỷ trước 24 giờ: hoàn 100%, 4–24 giờ: 50%, dưới 4 giờ: không hoàn."}</p>
          </CardBody>
        </Card>
      </form>
    </>
  );
}

export default function BookSessionPage({ params }: { params: { mentorId: string } }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      {(user) => (
        <Suspense>
          <BookSession user={user} mentorId={params.mentorId} />
        </Suspense>
      )}
    </RequireAuth>
  );
}
