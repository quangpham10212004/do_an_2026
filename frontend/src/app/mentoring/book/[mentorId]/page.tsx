"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import PackagePanel from "@/features/mentoring/PackagePanel";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { AGENDA_MAX, AGENDA_MIN, SESSION_DURATIONS, SESSION_TYPES, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { formatDateTime, formatMoney, formatRate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { IsoDateTime, MentorProfile, MentoringRequest, SessionDuration, SessionPackage, SessionType, SessionUser } from "@/types";

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
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [usePackageId, setUsePackageId] = useState<string>("");
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pickSlot = useCallback((scheduledAt: IsoDateTime | null) => setForm((f) => ({ ...f, scheduledAt })), []);

  useEffect(() => {
    profileApi.getMentor(mentorId).then(setMentor).catch(() => setMentor(null));
    mentoringApi.requests()
      .then((rs) => setRequest(rs.find((r) => r.mentorId === mentorId && r.status === "ACCEPTED") || null))
      .catch(() => setRequest(null));
    mentoringApi.packages().then((list) => setPackages(list.filter((p) => p.mentorId === mentorId))).catch(() => {});
  }, [mentorId]);

  const now = Date.now();
  // Gói dùng được cho thời lượng đang chọn: ACTIVE, còn buổi, chưa hết hạn
  const usable = packages.filter((p) => p.status === "ACTIVE" && p.sessionsRemaining > 0 && p.durationMinutes === form.durationMinutes
    && (!p.expiresAt || new Date(p.expiresAt).getTime() > now));
  const unpaid = packages.find((p) => p.status === "PENDING_PAYMENT") || null;
  const chosen = usable.find((p) => p.id === usePackageId) || null;
  // Chỉ giữ lựa chọn gói khi gói đó còn dùng được cho thời lượng đang chọn
  useEffect(() => {
    if (usePackageId && !usable.some((p) => p.id === usePackageId)) setUsePackageId("");
  }, [usePackageId, usable]);

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
        packageId: chosen ? chosen.id : undefined,
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
  if (!mentor) return <Alert>Không tìm thấy mentor. <Link href="/mentors">Xem danh sách mentor</Link></Alert>;
  if (!request) {
    return (
      <Alert type="info">
        Bạn cần được {mentor.displayName} chấp nhận yêu cầu mentoring trước khi đặt lịch.{" "}
        <Link href={`/mentoring/request/${mentorId}`}>Gửi yêu cầu</Link>
      </Alert>
    );
  }
  const price = Math.round((Number(mentor.hourlyRate) * form.durationMinutes) / 60 / 1000) * 1000;

  return (
    <>
      <PageHead title={`Đặt lịch với ${mentor.displayName}`} subtitle={`${mentor.domain} · ${formatRate(mentor.hourlyRate)}`} />
      <Alert>{error}</Alert>
      <form className="card stack" onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="duration">Thời lượng</label>
            <select id="duration" value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) as SessionDuration })}>
              {SESSION_DURATIONS.map((d) => <option key={d} value={d}>{d} phút</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sessionType">Loại phiên</label>
            <select id="sessionType" value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value as SessionType })}>
              {SESSION_TYPES.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Thời gian bắt đầu <span className="muted small">(giờ Việt Nam)</span></label>
          <SlotPicker mentorId={mentorId} durationMinutes={form.durationMinutes} value={form.scheduledAt} onChange={pickSlot} refreshKey={slotsVersion} />
        </div>
        <div className="field">
          <label htmlFor="agenda">Agenda <span className="muted small">(bắt buộc, {AGENDA_MIN}–{AGENDA_MAX} ký tự)</span></label>
          <textarea id="agenda" value={form.agenda} maxLength={AGENDA_MAX} required
            placeholder="Bạn muốn trao đổi gì trong phiên này? Ví dụ: review kiến trúc REST API của dự án quản lý kho"
            onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          <span className={`small ${agendaValid || !agenda ? "muted" : ""}`} style={agendaValid || !agenda ? undefined : { color: "var(--danger, #c92a2a)" }}>
            {agenda.length}/{AGENDA_MAX}{agenda.length > 0 && agenda.length < AGENDA_MIN ? ` — cần thêm ${AGENDA_MIN - agenda.length} ký tự` : ""}
          </span>
        </div>
        <div className="field">
          <label htmlFor="preRead">Tài liệu đọc trước <span className="muted small">(tuỳ chọn)</span></label>
          <input id="preRead" type="url" value={form.preReadLink} maxLength={500} placeholder="https://github.com/..."
            onChange={(e) => setForm({ ...form, preReadLink: e.target.value })} />
          {!linkValid && <span className="small" style={{ color: "var(--danger, #c92a2a)" }}>Link phải bắt đầu bằng http:// hoặc https://</span>}
        </div>
        {usable.length > 0 && (
          <div className="field">
            <label htmlFor="usePackage">Thanh toán bằng</label>
            <select id="usePackage" value={usePackageId} onChange={(e) => setUsePackageId(e.target.value)}>
              <option value="">Trả tiền buổi lẻ ({formatMoney(price)})</option>
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  Dùng gói {p.sessionsTotal} buổi — còn {p.sessionsRemaining} buổi{p.expiresAt ? ` (hết hạn ${formatDateTime(p.expiresAt)})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <p>
          <span className="small">{form.scheduledAt ? `${formatDateTime(form.scheduledAt)} · ${form.durationMinutes} phút · ${SESSION_TYPE_LABELS[form.sessionType]}` : <span className="muted">Chọn một khung giờ để tiếp tục</span>}<br /></span>
          <strong>Chi phí: {chosen ? "0 đ — trừ 1 buổi trong gói" : formatMoney(price)}</strong>
        </p>
        <div className="row">
          <button className="btn" disabled={busy || !form.scheduledAt || !agendaValid || !linkValid}>
            {busy ? "Đang kiểm tra lịch..." : price > 0 && !chosen ? "Xác nhận & thanh toán" : "Xác nhận đặt lịch"}
          </button>
          <Link href={`/mentors/${mentorId}`} className="btn secondary">Xem hồ sơ mentor</Link>
        </div>
      </form>
      {price > 0 && <PackagePanel mentorId={mentorId} durationMinutes={form.durationMinutes} pending={unpaid} />}
    </>
  );
}

export default function BookSessionPage({ params }: { params: { mentorId: string } }) {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <BookSession user={user} mentorId={params.mentorId} />}</RequireAuth>;
}
