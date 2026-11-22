"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { CalendarDays, FileText, Info } from "lucide-react";
import { Alert, Button, ButtonLink, Field, Input, Loading, Select, Textarea } from "@/components/ui";
import { FlowChoice, FlowHead, FlowTile } from "@/features/mentoring/FlowKit";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { AGENDA_MAX, AGENDA_MIN, SESSION_DURATIONS, SESSION_TYPES, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { MOCK_LEVELS, MOCK_LEVEL_LABELS, MOCK_TYPES, MOCK_TYPE_LABELS } from "@/features/mentoring/mockLabels";
import { formatMoney, getDisplayTimeZone } from "@/lib/format";
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
const REFERRAL_FORMAT = /^[A-Z0-9]{4,20}$/;

/** "T4, 26/11 · 19:30 – 20:30" theo múi giờ hiển thị của người dùng. */
function slotLabel(startAt: string, minutes: number): string {
  const timeZone = getDisplayTimeZone();
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  const day = start.toLocaleDateString("vi-VN", { timeZone, weekday: "short", day: "2-digit", month: "2-digit" });
  const hm = (d: Date) => d.toLocaleTimeString("vi-VN", { timeZone, hour: "2-digit", minute: "2-digit" });
  return `${day} · ${hm(start)} – ${hm(end)}`;
}

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
  const [refNote, setRefNote] = useState("");
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
      // Ví đủ tiền → học phí đã được tạm giữ (AWAITING_MENTOR) → màn hình hoàn tất; thiếu tiền (PENDING) → nạp ví / thanh toán.
      router.push(session.status === "PENDING" ? `/payment/${session.id}` : `/payment/${session.id}?booked=1`);
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
  const durations: SessionDuration[] = trial ? [15] : SESSION_DURATIONS;

  function applyReferral() {
    const code = form.referralCode.trim().toUpperCase();
    // TODO(backend): kiểm tra mã trước khi đặt lịch (chưa có endpoint) — hiện chỉ kiểm định dạng, mã được xác thực khi gửi đặt lịch.
    setRefNote(REFERRAL_FORMAT.test(code) ? "Đã ghi nhận mã, sẽ được kiểm tra khi bạn đặt lịch." : "Mã gồm 4–20 chữ cái hoặc chữ số.");
  }

  return (
    <div className="fl-page">
      <FlowHead back={{ href: `/mentors/${mentorId}`, label: mentor.displayName }} step={2}
        title={trial ? "Đặt buổi trải nghiệm 15 phút" : "Đặt lịch phiên mentoring"} />
      <form onSubmit={submit} className="fl-layout">
        <div className="fl-main">
          <Alert>{error}</Alert>
          <section className="fl-panel">
            <div className="fl-panel-head">
              <h2><span className="fl-ico" aria-hidden="true"><CalendarDays /></span>Chọn thời gian</h2>
              <p>Giờ hiển thị theo múi giờ {getDisplayTimeZone().replace("Asia/Ho_Chi_Minh", "GMT+7")} của bạn.</p>
            </div>
            <div className="fl-panel-body">
              <div className="fl-group">
                <div className="fl-group-label">Loại phiên</div>
                <FlowChoice label="Loại phiên" value={form.sessionType} onChange={(sessionType) => setForm({ ...form, sessionType })}
                  options={SESSION_TYPES.map((t) => ({ id: t, label: SESSION_TYPE_LABELS[t] }))} />
              </div>
              <div className="fl-group">
                <div className="fl-group-label">Thời lượng</div>
                <FlowChoice label="Thời lượng" value={form.durationMinutes} onChange={(durationMinutes) => setForm({ ...form, durationMinutes, scheduledAt: null })}
                  options={durations.map((d) => ({ id: d, label: `${d} phút` }))} />
              </div>
              <div className="fl-group">
                <div className="fl-group-label">Chọn ngày và giờ</div>
                <SlotPicker mentorId={mentorId} durationMinutes={form.durationMinutes} value={form.scheduledAt} onChange={pickSlot} refreshKey={slotsVersion} />
              </div>
            </div>
          </section>

          {isMock && (
            <section className="fl-panel">
              <div className="fl-panel-head">
                <h2><span className="fl-ico" aria-hidden="true"><FileText /></span>Thông tin phỏng vấn thử</h2>
                <p>Mentor dùng thông tin này để chuẩn bị câu hỏi sát với buổi phỏng vấn thật của bạn.</p>
              </div>
              <div className="fl-panel-body" style={{ gap: 18 }}>
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
              </div>
            </section>
          )}

          <section className="fl-panel">
            <div className="fl-panel-head">
              <h2><span className="fl-ico" aria-hidden="true"><Info /></span>Nội dung phiên</h2>
            </div>
            <div className="fl-panel-body" style={{ gap: 18 }}>
              <Field label="Agenda" id="agenda" required
                error={agenda.length > 0 && agenda.length < AGENDA_MIN ? `Cần thêm ${AGENDA_MIN - agenda.length} ký tự (tối thiểu ${AGENDA_MIN}).` : undefined}
                hint={`${agenda.length}/${AGENDA_MAX} ký tự, tối thiểu ${AGENDA_MIN}.`}>
                <Textarea id="agenda" value={form.agenda} maxLength={AGENDA_MAX} required rows={3}
                  placeholder="Bạn muốn trao đổi gì trong phiên này? Ví dụ: review kiến trúc REST API của dự án quản lý kho"
                  onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
              </Field>
              <Field label="Tài liệu đọc trước (không bắt buộc)" id="preRead"
                error={linkValid ? undefined : "Link phải bắt đầu bằng http:// hoặc https://"}>
                <Input id="preRead" type="url" value={form.preReadLink} maxLength={500} placeholder="https://github.com/…"
                  onChange={(e) => setForm({ ...form, preReadLink: e.target.value })} />
              </Field>
              {!trial && (
                <Field label="Mã giới thiệu (không bắt buộc, dùng cho buổi đầu tiên)" id="referral"
                  hint={refNote || "Chỉ dùng được ở buổi học đầu tiên với mentor này, không được giảm giá; người giới thiệu nhận thưởng sau khi buổi học hoàn thành."}>
                  <div className="input-group">
                    <Input id="referral" value={form.referralCode} maxLength={20} placeholder="VD: K7M2X9QA" className="font-mono uppercase"
                      onChange={(e) => { setForm({ ...form, referralCode: e.target.value }); setRefNote(""); }} />
                    <Button type="button" disabled={!form.referralCode.trim()} onClick={applyReferral}>Áp dụng</Button>
                  </div>
                </Field>
              )}
            </div>
          </section>

          {!isMock && (
            <section className="fl-note">
              <b>Mock interview?</b> Chọn loại phiên “{SESSION_TYPE_LABELS.MOCK_INTERVIEW}” để điền thêm dạng phỏng vấn, cấp độ, vị trí và công ty. Mentor dùng thông tin này để chuẩn bị câu hỏi sát thực tế.
            </section>
          )}
        </div>

        <aside className="fl-aside fl-aside-sticky" aria-label="Tóm tắt đặt lịch">
          <section className="fl-panel fl-side" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Tóm tắt đặt lịch</h2>
            <div className="mt-3.5 flex items-center gap-3 border-b border-border pb-3.5">
              <FlowTile name={mentor.displayName} src={mentor.avatarUrl} size="sm" />
              <div className="min-w-0">
                <b>{mentor.displayName}</b>
                {mentor.headline && <div className="text-[12px] text-ink-muted">{mentor.headline}</div>}
              </div>
            </div>
            <dl className="fl-dl">
              <div><dt>Loại phiên</dt><dd>{SESSION_TYPE_LABELS[form.sessionType]}</dd></div>
              <div><dt>Thời gian</dt><dd>{form.scheduledAt ? slotLabel(form.scheduledAt, form.durationMinutes) : <span className="text-ink-subtle">Chưa chọn</span>}</dd></div>
              <div><dt>Thời lượng</dt><dd>{form.durationMinutes} phút</dd></div>
            </dl>
            <div className="fl-total"><span className="text-ink-muted">Học phí</span><b className="tabular">{formatMoney(price)}</b></div>
            <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!ready} className="mt-4">
              {busy ? "Đang kiểm tra lịch…" : "Tiếp tục thanh toán →"}
            </Button>
            {!form.scheduledAt && <p className="fl-fine" style={{ textAlign: "center" }}>Chọn một khung giờ để tiếp tục.</p>}
            <p className="fl-fine">
              Ví đủ tiền thì học phí được tạm giữ ngay, thiếu thì bạn nạp thêm ở bước sau. Mentor xác nhận trong 24 giờ; nếu không xác nhận hoặc từ chối, bạn được hoàn 100%.{" "}
              {trial ? "Buổi trải nghiệm: huỷ trước 2 giờ hoàn 100%, dưới 2 giờ không hoàn." : "Huỷ trước 24 giờ: hoàn 100%, 4–24 giờ: 50%, dưới 4 giờ: không hoàn."}
            </p>
          </section>
          <section className="fl-note fl-note-warn">
            <b>Giữ chỗ 15 phút</b><br />Khung giờ được giữ cho bạn trong lúc thanh toán. Hết 15 phút chưa thanh toán, khung giờ được mở lại.
          </section>
        </aside>
      </form>
    </div>
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
