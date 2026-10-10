"use client";

import ReviewForm, { MenteeFeedbackForm } from "@/features/mentoring/ReviewForm";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { CalendarDays, CalendarPlus, FileText, Flag, Link2, MessageSquareText, Repeat, Star, Video, X } from "lucide-react";
import { Alert, Button, ButtonLink, Card, EmptyState, FlashAlerts, Loading, PageHeader, Stars, Tabs, useDialog, type AskFn, type Flash } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import DisputeForm, { canReportIssue } from "@/features/mentoring/DisputeForm";
import {
  ATTENDANCE_CHOICES,
  ATTENDANCE_LABELS,
  ATTENDANCE_RESOLUTION_LABELS,
  DISPUTE_OUTCOME_LABELS,
  MENTORING_STATUS_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
} from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { formatDateTime, formatMoney, formatInZone, getDisplayTimeZone } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { AttendanceAnswer, CancelPreview, MentoringSession, SessionStatus, SessionUser } from "@/types";

/** US-04 — nút "Tham gia" hiện từ 15 phút trước giờ bắt đầu tới khi phiên kết thúc. */
const JOIN_EARLY_MS = 15 * 60 * 1000;
function canJoin(s: MentoringSession, now = Date.now()): boolean {
  return now >= new Date(s.scheduledAt).getTime() - JOIN_EARLY_MS && now <= new Date(s.endsAt).getTime();
}

const FILTERS: [SessionStatus | "", string][] = [
  ["", "Tất cả"],
  ["PENDING", "Chờ thanh toán"],
  ["CONFIRMED", "Đã xác nhận"],
  ["AWAITING_ATTENDANCE", "Chờ xác nhận tham dự"],
  ["COMPLETED", "Hoàn thành"],
  ["DISPUTED", "Tranh chấp"],
  ["CANCELLED", "Đã huỷ"],
  ["EXPIRED", "Hết hạn"],
];

/** US-12 — đang trong 48 giờ xác nhận tham dự (job có thể chưa kịp chuyển CONFIRMED → AWAITING_ATTENDANCE). */
function attendanceOpen(s: MentoringSession, now = Date.now()): boolean {
  const ended = now >= new Date(s.endsAt).getTime();
  const beforeDeadline = now < new Date(s.attendanceDeadline).getTime();
  return (s.status === "AWAITING_ATTENDANCE" || (s.status === "CONFIRMED" && ended)) && beforeDeadline;
}

/** US-12 — hỏi mỗi bên phiên có diễn ra không (trong 48 giờ sau giờ kết thúc). */
function AttendancePrompt({ session, isMentor, ask, act }: {
  session: MentoringSession;
  isMentor: boolean;
  ask: AskFn;
  act: (fn: () => Promise<unknown>, ok: string) => void;
}) {
  const mine = isMentor ? session.mentorAttendance : session.menteeAttendance;
  const other = isMentor ? session.menteeAttendance : session.mentorAttendance;
  const deadline = formatDateTime(session.attendanceDeadline);
  if (mine) {
    return (
      <Alert tone="info">
        Bạn đã xác nhận: <strong>{ATTENDANCE_LABELS[mine]}</strong>.{" "}
        {other ? "" : `Đang chờ ${isMentor ? "mentee" : "mentor"} xác nhận (hạn ${deadline}); nếu không phản hồi, câu trả lời của bạn được áp dụng.`}
      </Alert>
    );
  }
  const choose = async (answer: AttendanceAnswer) => {
    if (answer !== "HELD") {
      const ok = await ask({
        title: `Xác nhận: ${ATTENDANCE_LABELS[answer]}?`,
        message: answer === "CANCELLED_ON_CALL"
          ? "Phiên sẽ được huỷ và mentee được hoàn 100% nếu bên kia đồng ý hoặc không phản hồi trong 48 giờ. Nếu bên kia trả lời khác, phiên chuyển sang tranh chấp."
          : "Nếu bên kia không phản hồi trong 48 giờ, phiên được ghi nhận vắng mặt. Nếu bên kia trả lời khác, phiên chuyển sang tranh chấp và khoản thanh toán được tạm giữ.",
        confirmText: "Gửi xác nhận",
        danger: true,
      });
      if (!ok) return;
    }
    act(() => mentoringApi.answerAttendance(session.id, answer), "Đã ghi nhận xác nhận tham dự");
  };
  return (
    <Alert tone="warning" title="Phiên có diễn ra không?">
      Hạn xác nhận: {deadline}.{other && <> {isMentor ? "Mentee" : "Mentor"} đã xác nhận.</>}
      <div className="mt-2 flex flex-wrap gap-2">
        {ATTENDANCE_CHOICES[isMentor ? "MENTOR" : "MENTEE"].map((a) => (
          <Button key={a} size="sm" variant={a === "HELD" ? "primary" : "secondary"} onClick={() => choose(a)}>
            {ATTENDANCE_LABELS[a]}
          </Button>
        ))}
      </div>
    </Alert>
  );
}

/** Dòng giải thích kết quả của phiên đã kết luận (US-12) hoặc đã huỷ / hết hạn. */
function outcomeText(s: MentoringSession): string | null {
  const paid = Number(s.price) > 0;
  switch (s.status) {
    case "NO_SHOW_MENTOR":
      return `Mentor vắng mặt${paid ? " · mentee được hoàn 100%" : ""}`;
    case "NO_SHOW_MENTEE":
      return "Mentee vắng mặt · không hoàn tiền";
    case "DISPUTED":
      return `Hai bên xác nhận khác nhau${paid ? " · khoản thanh toán đang được tạm giữ chờ quản trị viên xử lý" : " · chờ quản trị viên xử lý"}`;
    case "EXPIRED":
      return "Quá hạn thanh toán, khung giờ đã được giải phóng";
    case "COMPLETED":
      return s.attendanceResolution ? `Hoàn thành: ${ATTENDANCE_RESOLUTION_LABELS[s.attendanceResolution]}` : null;
    case "CANCELLED": {
      if (!s.cancelledBy) return null;
      const who = s.cancelReason === "CANCELLED_ON_CALL" ? "Huỷ trong buổi gọi"
        : `Huỷ bởi ${s.cancelledBy === "MENTEE" ? "mentee" : s.cancelledBy === "MENTOR" ? "mentor" : "hệ thống"}`;
      const refund = s.refundPercent !== null && paid ? ` · hoàn ${s.refundPercent}%` : "";
      const reason = s.cancelReason && !["PAYMENT_TIMEOUT", "CANCELLED_ON_CALL"].includes(s.cancelReason) ? ` · ${s.cancelReason}` : "";
      return who + refund + reason;
    }
    default:
      return null;
  }
}

/** US-32 — dòng trạng thái tranh chấp của phiên. */
function disputeText(s: MentoringSession): string | null {
  const d = s.dispute;
  if (!d) return null;
  if (d.status !== "RESOLVED") return `Báo cáo sự cố: ${MENTORING_STATUS_LABELS[d.status]} — quản trị viên phản hồi trong 48 giờ`;
  const outcome = d.outcome ? DISPUTE_OUTCOME_LABELS[d.outcome] : "";
  return `Báo cáo sự cố đã giải quyết: ${outcome}${d.outcome === "PARTIAL_REFUND" && d.refundPercent ? ` (${d.refundPercent}%)` : ""}`;
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
        <p className="text-small text-ink-muted">{session.durationMinutes} phút, giữ nguyên chi phí. Bên còn lại cần đồng ý trong 24 giờ (và trước giờ bắt đầu cũ 1 giờ).</p>
      </div>
      <Alert>{error}</Alert>
      <SlotPicker mentorId={session.mentorId} durationMinutes={session.durationMinutes} value={newStart} onChange={pick}
        refreshKey={version} excludeSessionId={session.id} />
      <div><Button variant="primary" size="sm" disabled={!newStart} loading={busy} onClick={async () => {
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
      }}>Gửi đề xuất dời lịch</Button></div>
    </div>
  );
}

/** Ô ngày kiểu tờ lịch: thứ, ngày, giờ — theo múi giờ hiển thị của người xem. */
function DateTile({ iso }: { iso: string }) {
  const d = new Date(iso);
  const timeZone = getDisplayTimeZone();
  return (
    <div className="flex w-16 flex-none flex-col items-center rounded-md border border-border bg-surface-sunken py-1.5 text-center">
      <span className="text-[11px] leading-4 font-semibold uppercase text-ink-muted">{d.toLocaleDateString("vi-VN", { timeZone, weekday: "short" })}</span>
      <span className="font-mono text-title-2 leading-7 font-medium tabular">{d.toLocaleDateString("vi-VN", { timeZone, day: "2-digit" })}</span>
      <span className="text-[11px] leading-4 text-ink-muted tabular">{d.toLocaleDateString("vi-VN", { timeZone, month: "2-digit", year: "2-digit" })}</span>
    </div>
  );
}

function Sessions({ user }: { user: SessionUser }) {
  const params = useSearchParams();
  const [items, setItems] = useState<MentoringSession[] | undefined>(undefined);
  const [filter, setFilter] = useState<SessionStatus | "">("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [dialog, ask] = useDialog();
  const [msg, setMsg] = useState<Flash>(params.get("booked") ? { ok: "Đặt lịch thành công!" } : params.get("paid") ? { ok: "Thanh toán thành công, phiên đã được xác nhận." } : {});
  const isMentor = user.role === "MENTOR";
  const load = useCallback(
    () => mentoringApi.sessions(filter).then(setItems).catch((e) => { setItems((cur) => cur ?? []); setMsg({ error: errorMessage(e) }); }),
    [filter]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  return (
    <>
      <PageHeader title="Phiên học" description="Các phiên sắp tới và lịch sử phiên mentoring của bạn." />
      {dialog}
      <FlashAlerts flash={msg} className="mb-6" />
      <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={FILTERS.map(([v, l]) => ({ id: v, label: l }))} />
      {items === undefined ? <Loading /> : items.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title={filter ? "Không có phiên nào ở trạng thái này" : "Chưa có phiên nào"}
            action={!isMentor && !filter && <ButtonLink href="/mentoring/requests" size="sm">Đặt lịch từ yêu cầu đã được chấp nhận</ButtonLink>}>
            {filter ? "Chọn bộ lọc khác để xem phiên." : "Phiên bạn đặt hoặc được đặt sẽ hiện ở đây."}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((s) => {
            const future = new Date(s.scheduledAt) > new Date();
            const other = isMentor ? s.menteeName : s.mentorName;
            const otherTz = isMentor ? s.menteeTimezone : s.mentorTimezone;
            const tzTitle = otherTz && otherTz !== getDisplayTimeZone() ? `Giờ của ${other}: ${formatInZone(s.scheduledAt, otherTz)}` : undefined;
            const toggle = (cur: string | null, set: (v: string | null) => void) => () => set(cur === s.id ? null : s.id);
            const outcome = outcomeText(s);
            const dispute = disputeText(s);
            return (
              <Card as="article" key={s.id}>
                <div className="flex flex-col gap-4 p-5 max-sm:p-4">
                  <div className="flex items-start gap-4">
                    <DateTile iso={s.scheduledAt} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isMentor ? <strong className="text-title-3">{other}</strong> : <Link href={`/mentors/${s.mentorId}`} className="text-title-3 font-semibold">{other}</Link>}
                        <MentoringStatusBadge status={s.status} labels={SESSION_STATUS_LABELS} />
                        {s.reviewed && <Stars value={s.reviewRating} />}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-small text-ink-muted">
                        <span title={tzTitle} className="tabular">{formatDateTime(s.scheduledAt)}</span>
                        <span>{s.durationMinutes} phút</span>
                        <span className="tabular">{formatMoney(s.price)}</span>
                        {s.sessionType && <span>{SESSION_TYPE_LABELS[s.sessionType]}</span>}
                        {s.topic && <span>{s.topic}</span>}
                      </div>
                      {s.status === "CONFIRMED" && s.meetingLink && !canJoin(s) && future && (
                        <div className="text-small text-ink-subtle">Nút “Tham gia” mở từ 15 phút trước giờ bắt đầu.</div>
                      )}
                    </div>
                    {s.status === "CONFIRMED" && s.meetingLink && canJoin(s) && (
                      <a className="btn btn-primary" href={s.meetingLink} target="_blank" rel="noreferrer"><Video aria-hidden="true" />Tham gia</a>
                    )}
                  </div>
                  {(s.agenda || s.preReadLink) && (
                    <div className="well flex flex-col gap-1">
                      {s.agenda && <p className="whitespace-pre-wrap">{s.agenda}</p>}
                      {s.preReadLink && <a href={s.preReadLink} target="_blank" rel="noreferrer" className="text-small">Tài liệu đọc trước</a>}
                    </div>
                  )}
                  {outcome && <div className="text-small text-ink-muted">{outcome}</div>}
                  {dispute && <Alert tone={s.dispute?.status === "RESOLVED" ? "info" : "warning"}>{dispute}</Alert>}
                  {attendanceOpen(s) && <AttendancePrompt session={s} isMentor={isMentor} ask={ask} act={act} />}
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
                  {rescheduling === s.id && <RescheduleForm session={s} onDone={(ok) => { setRescheduling(null); setMsg({ ok }); load(); }} />}
                  {reporting === s.id && (
                    <DisputeForm session={s} onCancel={() => setReporting(null)}
                      onDone={(ok) => { setReporting(null); setMsg({ ok }); load(); }} />
                  )}
                  {reviewing === s.id && (
                    isMentor
                      ? <MenteeFeedbackForm sessionId={s.id} onDone={(ok) => { setReviewing(null); setMsg({ ok }); }} />
                      : <ReviewForm sessionId={s.id} onDone={() => { setReviewing(null); setMsg({ ok: "Cảm ơn bạn đã đánh giá." }); load(); }} />
                  )}
                </div>
                <div className="card-foot">
                  {["PENDING", "CONFIRMED"].includes(s.status) && future && (
                    <Button variant="danger-quiet" icon={X} className="mr-auto" onClick={async () => {
                      setMsg({});
                      let preview: CancelPreview;
                      try {
                        preview = await mentoringApi.cancelPreview(s.id);
                      } catch (e) {
                        setMsg({ error: errorMessage(e) });
                        return;
                      }
                      const paid = s.status === "CONFIRMED" && Number(s.price) > 0;
                      const refundLine = paid ? `Số tiền được hoàn: ${Number(preview.refundAmount) > 0 ? formatMoney(preview.refundAmount) : "0 đ"} (${preview.refundPercent}%).` : "";
                      const reason = await ask({ title: "Huỷ phiên học?", message: <>{refundLine && <strong className="text-ink">{refundLine}<br /></strong>}{preview.policyText}</>, input: { label: "Lý do huỷ (không bắt buộc)", maxLength: 300 }, confirmText: "Huỷ phiên", cancelText: "Giữ phiên", danger: true });
                      if (reason !== null) act(() => mentoringApi.cancelSession(s.id, reason), Number(preview.refundAmount) > 0 ? `Đã huỷ phiên, ${formatMoney(preview.refundAmount)} sẽ được hoàn lại.` : "Đã huỷ phiên.");
                    }}>Huỷ phiên</Button>
                  )}
                  {canReportIssue(s) && <Button variant="ghost" icon={Flag} className="mr-auto" onClick={toggle(reporting, setReporting)}>Báo cáo sự cố</Button>}
                  {!["PENDING", "EXPIRED"].includes(s.status) && (
                    <ButtonLink href={`/mentoring/sessions/${s.id}/notes`} icon={FileText}>Ghi chú</ButtonLink>
                  )}
                  {s.status === "CONFIRMED" && future && (
                    <Button icon={CalendarPlus} title="Tải file .ics; tải lại sau khi dời lịch để cập nhật"
                      onClick={() => mentoringApi.downloadCalendar(s.id).catch((e) => setMsg({ error: errorMessage(e) }))}>
                      Thêm vào lịch
                    </Button>
                  )}
                  {isMentor && ["PENDING", "CONFIRMED"].includes(s.status) && future && (
                    <Button icon={Link2} onClick={async () => {
                      const link = await ask({ title: "Link phòng họp cho phiên này", message: "Hỗ trợ link https của Google Meet, Zoom hoặc Microsoft Teams.", input: { label: "Link phòng họp", defaultValue: s.meetingLink || "", maxLength: 500, placeholder: "https://meet.google.com/…" }, confirmText: "Lưu link" });
                      if (link) act(() => mentoringApi.updateMeetingLink(s.id, link.trim()), "Đã cập nhật link phòng họp.");
                    }}>Link họp</Button>
                  )}
                  {s.status === "CONFIRMED" && !s.pendingReschedule && s.rescheduleCount < 2
                    && new Date(s.scheduledAt).getTime() - Date.now() >= 2 * 3600 * 1000 && (
                    <Button icon={Repeat} onClick={toggle(rescheduling, setRescheduling)}>Dời lịch</Button>
                  )}
                  {!isMentor && s.status === "COMPLETED" && !s.reviewed && (
                    <Button variant="primary" icon={Star} onClick={toggle(reviewing, setReviewing)}>Đánh giá</Button>
                  )}
                  {isMentor && s.status === "COMPLETED" && (
                    <Button icon={MessageSquareText} onClick={toggle(reviewing, setReviewing)}>Nhận xét mentee</Button>
                  )}
                  {!isMentor && s.status === "PENDING" && <ButtonLink href={`/payment/${s.id}`} variant="primary">Thanh toán</ButtonLink>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function SessionsPage() {
  return (
    <RequireAuth roles={["MENTEE", "MENTOR"]}>
      {(user) => (
        <Suspense>
          <Sessions user={user} />
        </Suspense>
      )}
    </RequireAuth>
  );
}
