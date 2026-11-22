"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CheckCheck, ClipboardCheck, FileText, Flag, Info, Mic, Repeat, Star, Video, X } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, Button, ButtonLink, FlashAlerts, Loading, useDialog, type Flash } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import DisputeForm, { canReportIssue } from "@/features/mentoring/DisputeForm";
import { MENTORING_STATUS_LABELS, SESSION_STATUS_LABELS, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import SessionMoney from "@/features/mentoring/SessionMoney";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { attendanceOpen, canJoin, formatCountdown } from "@/features/mentoring/sessionFlow";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { CancelPreview, MentoringSession, SessionUser } from "@/types";

const PREP_ITEMS = [
  "Đã đọc agenda và gửi tài liệu cần xem trước",
  "Chạy được sản phẩm / tài liệu trên máy để mentor xem",
  "Chuẩn bị 2–3 câu hỏi cụ thể",
];

/** Đếm ngược tới giờ bắt đầu (cập nhật mỗi giây), chỉ hiện khi còn dưới 72 giờ. */
function HeroClock({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0 || ms > 72 * 3600_000) return null;
  return (
    <div className="ses-hero-clock" role="timer" aria-label={`Bắt đầu sau ${formatCountdown(ms)}`}>
      <span>Bắt đầu sau</span>
      <b>{formatCountdown(ms)}</b>
    </div>
  );
}

/** Danh sách chuẩn bị trước giờ học — chỉ lưu trên trình duyệt của mentee. */
function PrepChecklist({ sessionId }: { sessionId: string }) {
  const key = `mh-prep-${sessionId}`;
  const [done, setDone] = useState<boolean[]>(PREP_ITEMS.map(() => false));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDone(PREP_ITEMS.map((_, i) => !!(JSON.parse(raw) as boolean[])[i]));
    } catch { /* không có localStorage: bỏ qua */ }
  }, [key]);
  const toggle = (i: number) => setDone((cur) => {
    const next = cur.map((v, j) => (j === i ? !v : v));
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* bỏ qua */ }
    return next;
  });
  return (
    <section className="ses-sec" aria-label="Chuẩn bị trước giờ học">
      <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><ClipboardCheck /></span>Chuẩn bị trước giờ học</h2></div>
      <div className="ses-sec-body">
        <ul>
          {PREP_ITEMS.map((t, i) => (
            <li key={t}>
              <label className="ses-check"><input type="checkbox" checked={done[i]} onChange={() => toggle(i)} />{t}</label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** US-06 — chọn giờ mới để đề xuất dời lịch. */
function RescheduleForm({ session, onDone }: { session: MentoringSession; onDone: (ok: string) => void }) {
  const [newStart, setNewStart] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const pick = useCallback((v: string | null) => setNewStart(v), []);
  return (
    <div className="well flex flex-col gap-3">
      <div>
        <div className="font-semibold">Đề xuất giờ mới</div>
        <p className="text-small text-ink-muted">{session.durationMinutes} phút, giữ nguyên chi phí. Bên còn lại cần đồng ý trong 24 giờ.</p>
      </div>
      <Alert>{error}</Alert>
      <SlotPicker mentorId={session.mentorId} durationMinutes={session.durationMinutes} value={newStart} onChange={pick}
        refreshKey={version} excludeSessionId={session.id} />
      <div>
        <Button variant="primary" size="sm" disabled={!newStart} loading={busy} onClick={async () => {
          if (!newStart) return;
          setBusy(true);
          setError("");
          try {
            await mentoringApi.proposeReschedule(session.id, newStart);
            onDone(`Đã gửi đề xuất dời lịch sang ${formatDateTime(newStart)}.`);
          } catch (e) {
            setError(errorMessage(e));
            setVersion((v) => v + 1);
          } finally {
            setBusy(false);
          }
        }}>Gửi đề xuất dời lịch</Button>
      </div>
    </div>
  );
}

function Detail({ user }: { user: SessionUser }) {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<MentoringSession | null | undefined>(undefined);
  const [msg, setMsg] = useState<Flash>({});
  const [panel, setPanel] = useState<"reschedule" | "report" | null>(null);
  const [dialog, ask] = useDialog();
  const isMentor = user.role === "MENTOR";

  const load = useCallback(
    () => mentoringApi.session(id).then(setS).catch((e) => { setS((cur) => cur ?? null); setMsg({ error: errorMessage(e) }); }),
    [id],
  );
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      setPanel(null);
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  if (s === undefined) return <Loading />;
  if (s === null) {
    return (
      <>
        <FlashAlerts flash={msg} className="mb-4" />
        <ButtonLink href="/mentoring/sessions">Về danh sách phiên</ButtonLink>
      </>
    );
  }

  const other = isMentor ? s.menteeName : s.mentorName;
  const future = new Date(s.scheduledAt) > new Date();
  const live = (s.status === "CONFIRMED" || s.status === "AWAITING_ATTENDANCE") && canJoin(s);
  const title = `${s.topic || (s.sessionType ? SESSION_TYPE_LABELS[s.sessionType] : "Phiên mentoring")} với ${other}`;
  const weekday = new Date(s.scheduledAt).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const joinHint = s.status === "CONFIRMED" && future && !live
    ? `Nút vào phòng sáng lên lúc ${hm(new Date(new Date(s.scheduledAt).getTime() - 10 * 60_000).toISOString())}.`
    : s.status === "AWAITING_MENTOR" ? "Phòng học mở sau khi mentor xác nhận buổi học." : "Phòng học mở 10 phút trước giờ bắt đầu.";
  const canCancel = ["PENDING", "AWAITING_MENTOR", "CONFIRMED"].includes(s.status) && future;
  const canResched = s.status === "CONFIRMED" && !s.pendingReschedule && s.rescheduleCount < 2 && new Date(s.scheduledAt).getTime() - Date.now() >= 2 * 3600_000;
  const needAttendance = attendanceOpen(s) && !(isMentor ? s.mentorAttendance : s.menteeAttendance);
  const showMoney = Number(s.price) > 0 && !["EXPIRED", "PENDING"].includes(s.status);

  async function cancel() {
    if (!s) return;
    setMsg({});
    let preview: CancelPreview;
    try { preview = await mentoringApi.cancelPreview(s.id); } catch (e) { setMsg({ error: errorMessage(e) }); return; }
    const paid = (s.status === "CONFIRMED" || s.status === "AWAITING_MENTOR") && Number(s.price) > 0;
    const refundLine = paid ? `Số tiền được hoàn: ${Number(preview.refundAmount) > 0 ? formatMoney(preview.refundAmount) : "0 đ"} (${preview.refundPercent}%).` : "";
    const reason = await ask({
      title: "Huỷ phiên học?",
      message: <>{refundLine && <strong className="text-ink">{refundLine}<br /></strong>}{preview.policyText}</>,
      input: { label: "Lý do huỷ (không bắt buộc)", maxLength: 300 }, confirmText: "Huỷ phiên", cancelText: "Giữ phiên", danger: true,
    });
    if (reason !== null) act(() => mentoringApi.cancelSession(s.id, reason), "Đã huỷ phiên.");
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <Link href="/mentoring/sessions" className="inline-flex min-h-[44px] items-center text-small text-ink-muted">← Phiên học</Link>
      <FlashAlerts flash={msg} />

      <section className="ses-hero" aria-label="Tổng quan phiên">
        <div className="ses-hero-main">
          <span className="ses-hero-tag">{SESSION_STATUS_LABELS[s.status] ?? s.status}</span>
          <h1>{title}</h1>
          <p>{weekday} · {hm(s.scheduledAt)} – {hm(s.endsAt)} · {s.durationMinutes} phút</p>
        </div>
        {s.status === "CONFIRMED" && future && <HeroClock iso={s.scheduledAt} />}
      </section>

      <div className="ses-grid">
        <main className="ses-main">
          {s.status === "AWAITING_MENTOR" && (
            <Alert tone="warning" title={isMentor ? "Mentor cần xác nhận buổi học" : "Đang chờ mentor xác nhận"}>
              {s.confirmDeadline ? `Hạn xác nhận ${formatDateTime(s.confirmDeadline)}; quá hạn buổi tự huỷ và học phí được hoàn 100%.` : "Quá hạn buổi tự huỷ và học phí được hoàn 100%."}
              {isMentor && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => act(() => mentoringApi.confirmSession(s.id), "Đã xác nhận buổi học.")}>Xác nhận</Button>
                  <Button variant="danger-quiet" onClick={async () => {
                    const reason = await ask({ title: "Từ chối buổi học?", message: "Học phí đã tạm giữ sẽ được hoàn 100% cho mentee.", input: { label: "Lý do (không bắt buộc)", maxLength: 300 }, confirmText: "Từ chối", cancelText: "Giữ lại", danger: true });
                    if (reason !== null) act(() => mentoringApi.declineSession(s.id, reason), "Đã từ chối buổi học, mentee được hoàn 100%.");
                  }}>Từ chối</Button>
                </div>
              )}
            </Alert>
          )}

          {needAttendance && (
            <Alert tone="warning" title="Phiên có diễn ra không?">
              Hạn xác nhận {formatDateTime(s.attendanceDeadline)}.
              <div className="mt-2"><ButtonLink href={`/mentoring/sessions/${s.id}/complete`} variant="primary" icon={CheckCheck}>Xác nhận buổi học</ButtonLink></div>
            </Alert>
          )}

          {s.pendingReschedule && (
            <Alert tone="info" title={`Đề xuất dời sang ${formatDateTime(s.pendingReschedule.newStart)}`}>
              Hết hạn {formatDateTime(s.pendingReschedule.expiresAt)}.
              <div className="mt-2 flex flex-wrap gap-2">
                {s.pendingReschedule.proposedBy === user.userId ? (
                  <Button size="sm" onClick={() => s.pendingReschedule && act(() => mentoringApi.declineReschedule(s.pendingReschedule!.id), "Đã rút lại đề xuất dời lịch.")}>Rút lại đề xuất</Button>
                ) : (
                  <>
                    <Button size="sm" variant="primary" onClick={() => s.pendingReschedule && act(() => mentoringApi.acceptReschedule(s.pendingReschedule!.id), "Đã đồng ý dời lịch.")}>Đồng ý</Button>
                    <Button size="sm" onClick={() => s.pendingReschedule && act(() => mentoringApi.declineReschedule(s.pendingReschedule!.id), "Đã từ chối đề xuất dời lịch.")}>Từ chối</Button>
                  </>
                )}
              </div>
            </Alert>
          )}

          <section className="ses-sec" aria-label="Hành động">
            <div className="ses-sec-body ses-actions">
              <div className="ses-actions-text">
                <b className="text-title-3">{live ? "Phòng học đang mở" : "Phòng học"}</b>
                <p className="text-small text-ink-muted">{live ? "Bạn có thể vào phòng ngay bây giờ." : joinHint}</p>
              </div>
              {live ? (
                <ButtonLink href={`/mentoring/sessions/${s.id}/room`} variant="primary" size="lg" icon={Video}>Vào phòng học</ButtonLink>
              ) : (
                ["CONFIRMED", "AWAITING_ATTENDANCE"].includes(s.status) && <Button size="lg" icon={Video} disabled>Vào phòng học</Button>
              )}
              {canResched && <Button size="lg" icon={Repeat} onClick={() => setPanel(panel === "reschedule" ? null : "reschedule")} aria-expanded={panel === "reschedule"}>Đổi lịch</Button>}
              {canCancel && <Button size="lg" variant="danger-quiet" icon={X} onClick={cancel}>Huỷ phiên</Button>}
            </div>
          </section>

          {panel === "reschedule" && <RescheduleForm session={s} onDone={(ok) => { setPanel(null); setMsg({ ok }); load(); }} />}
          {panel === "report" && <DisputeForm session={s} onCancel={() => setPanel(null)} onDone={(ok) => { setPanel(null); setMsg({ ok }); load(); }} />}

          <section className="ses-sec" aria-label="Nội dung phiên">
            <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><Info /></span>Nội dung phiên</h2></div>
            <div className="ses-sec-body flex flex-col gap-4">
              <div>
                <div className="ses-label">Agenda</div>
                <p className="mt-1 whitespace-pre-wrap">{s.agenda || "Chưa có agenda."}</p>
              </div>
              {s.preReadLink && (
                <div>
                  <div className="ses-label">Tài liệu đọc trước</div>
                  <a href={s.preReadLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center font-semibold [overflow-wrap:anywhere]">{s.preReadLink.replace(/^https?:\/\//, "")}</a>
                </div>
              )}
              {s.dispute && (
                <Alert tone={s.dispute.status === "RESOLVED" ? "info" : "warning"}>Báo cáo sự cố: {MENTORING_STATUS_LABELS[s.dispute.status]}</Alert>
              )}
            </div>
          </section>

          {!isMentor && ["PENDING", "AWAITING_MENTOR", "CONFIRMED"].includes(s.status) && <PrepChecklist sessionId={s.id} />}

          {showMoney && (
            <section id="money" aria-label="Tiền của phiên" className="flex flex-col gap-3">
              <h2 className="text-title-2 font-bold">Tiền của phiên</h2>
              <SessionMoney session={s} isMentor={isMentor} />
            </section>
          )}
        </main>

        <aside className="ses-side" aria-label="Thông tin thêm">
          <section className="ses-sec"><div className="ses-sec-body">
            <div className="flex items-center gap-3">
              <Avatar name={other} size="lg" />
              <div className="min-w-0">
                <b className="text-title-3 [overflow-wrap:anywhere]">{other}</b>
                <div className="text-small text-ink-muted">{isMentor ? "Mentee" : "Mentor"}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <ButtonLink href="/messages" block>{isMentor ? "Nhắn tin cho mentee" : "Nhắn tin cho mentor"}</ButtonLink>
              {!isMentor && <Link href={`/mentors/${s.mentorId}`} className="inline-flex min-h-[44px] items-center justify-center text-small text-ink-muted">Xem hồ sơ</Link>}
            </div>
          </div></section>

          {showMoney && <SessionMoney session={s} isMentor={isMentor} compact />}

          <section className="ses-sec"><div className="ses-sec-body flex flex-col gap-1">
            <h2 className="mb-1 text-title-3 font-bold">Liên quan tới phiên</h2>
            {!["PENDING", "AWAITING_MENTOR", "EXPIRED"].includes(s.status) && (
              <ButtonLink href={`/mentoring/sessions/${s.id}/notes`} icon={FileText} variant="ghost" block>Ghi chú và việc cần làm</ButtonLink>
            )}
            {s.sessionType === "MOCK_INTERVIEW" && !["PENDING", "EXPIRED", "CANCELLED"].includes(s.status) && (
              <ButtonLink href={`/mentoring/sessions/${s.id}/mock`} icon={Mic} variant="ghost" block>{isMentor ? "Phiếu phỏng vấn thử" : "Kết quả phỏng vấn thử"}</ButtonLink>
            )}
            {s.status === "COMPLETED" && (isMentor || (s.kind !== "TRIAL" && !s.reviewed)) && (
              <ButtonLink href={`/mentoring/sessions/${s.id}/review`} icon={Star} variant="ghost" block>{isMentor ? "Đánh giá mentee" : "Đánh giá mentor"}</ButtonLink>
            )}
            {s.status === "CONFIRMED" && future && (
              <Button variant="ghost" icon={CalendarPlus} className="justify-start"
                onClick={() => mentoringApi.downloadCalendar(s.id).catch((e) => setMsg({ error: errorMessage(e) }))}>Thêm vào lịch</Button>
            )}
            {canReportIssue(s) && (
              <Button variant="ghost" icon={Flag} className="justify-start" onClick={() => setPanel(panel === "report" ? null : "report")}>Báo cáo sự cố</Button>
            )}
          </div></section>

          <section className="ses-sec"><div className="ses-sec-body">
            <h2 className="text-title-3 font-bold">Chính sách huỷ và đổi lịch</h2>
            <ul className="mt-2 list-disc pl-5 text-small text-ink-muted">
              <li>Đổi lịch bất kỳ lúc nào trước giờ bắt đầu, miễn phí, tối đa 2 lần.</li>
              <li>Mức hoàn khi huỷ tuỳ thời điểm huỷ; hệ thống hiện số tiền hoàn trước khi bạn xác nhận.</li>
            </ul>
          </div></section>
        </aside>
      </div>
    </div>
  );
}

export default function SessionDetailPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Detail user={user} />}</RequireAuth>;
}
