"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Star } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, Button, ButtonLink, FlashAlerts, Loading, PageHeader, useDialog, type Flash } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import DisputeForm from "@/features/mentoring/DisputeForm";
import { ATTENDANCE_CHOICES, ATTENDANCE_LABELS, ATTENDANCE_RESOLUTION_LABELS, SESSION_STATUS_LABELS } from "@/features/mentoring/labels";
import { attendanceOpen } from "@/features/mentoring/sessionFlow";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { AttendanceAnswer, MentoringSession, SessionUser } from "@/types";

const CHOICE_HINT: Record<AttendanceAnswer, string> = {
  HELD: "Hai bên đã học đủ hoặc gần đủ thời gian.",
  MENTOR_NO_SHOW: "Được hoàn tiền sau khi hệ thống đối chiếu nhật ký phòng học.",
  MENTEE_NO_SHOW: "Được đối chiếu với nhật ký phòng học trước khi kết luận.",
  CANCELLED_ON_CALL: "Hai bên thống nhất dừng giữa chừng.",
};

function remaining(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 60000));
  return `${Math.floor(mins / 60)} giờ ${mins % 60} phút`;
}

function Complete({ user }: { user: SessionUser }) {
  const { id } = useParams<{ id: string }>();
  const isMentor = user.role === "MENTOR";
  const [s, setS] = useState<MentoringSession | undefined>(undefined);
  const [msg, setMsg] = useState<Flash>({});
  const [choice, setChoice] = useState<AttendanceAnswer>("HELD");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [dialog, ask] = useDialog();

  const load = useCallback(() => mentoringApi.session(id).then(setS).catch((e) => setMsg({ error: errorMessage(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!s) return msg.error ? <FlashAlerts flash={msg} /> : <Loading />;

  const other = isMentor ? s.menteeName : s.mentorName;
  const mine = isMentor ? s.mentorAttendance : s.menteeAttendance;
  const theirs = isMentor ? s.menteeAttendance : s.mentorAttendance;
  const open = attendanceOpen(s, now);
  const roleKey = isMentor ? "MENTOR" : "MENTEE";
  const ended = now >= new Date(s.endsAt).getTime();

  async function submit() {
    if (!s) return;
    if (choice !== "HELD") {
      const ok = await ask({
        title: `Xác nhận: ${ATTENDANCE_LABELS[choice]}?`,
        message: choice === "CANCELLED_ON_CALL"
          ? "Phiên sẽ được huỷ và mentee được hoàn 100% nếu bên kia đồng ý hoặc không phản hồi trong 24 giờ. Nếu bên kia trả lời khác, phiên chuyển sang tranh chấp."
          : "Vắng mặt được đối chiếu với nhật ký vào phòng học: chỉ báo được khi bên kia chưa từng vào phòng. Nếu bên kia trả lời khác, phiên chuyển sang tranh chấp và khoản thanh toán được tạm giữ.",
        confirmText: "Gửi xác nhận", danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setMsg({});
    try {
      await mentoringApi.answerAttendance(s.id, choice);
      setMsg({ ok: "Đã ghi nhận xác nhận tham dự." });
      await load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <Avatar name={other} />
      <div className="min-w-0">
        <b className="[overflow-wrap:anywhere]">{s.topic || "Phiên học"} · {other}</b>
        <div className="text-small text-ink-muted">{formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút</div>
      </div>
    </div>
  );

  return (
    <>
      {dialog}
      <PageHeader back={{ href: `/mentoring/sessions/${s.id}`, label: "Chi tiết phiên" }} title="Xác nhận buổi học"
        description="Cả hai bên xác nhận buổi học đã diễn ra. Khi hai bên khớp nhau, phiên hoàn thành và học phí bắt đầu được giải phóng cho mentor." />
      <FlashAlerts flash={msg} className="mb-4" />
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {/* 1 · Xác nhận của bạn */}
        {!mine && open && (
          <section className="ses-sec" aria-label="Bạn xác nhận">
            <div className="ses-sec-head"><h2>Bạn xác nhận ({isMentor ? "Mentor" : "Mentee"})</h2></div>
            <form className="ses-sec-body flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              {header}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-title-3 font-bold">Buổi học đã diễn ra như thế nào?</legend>
                <div role="radiogroup" aria-label="Xác nhận tham dự" className="flex flex-col gap-2">
                  {ATTENDANCE_CHOICES[roleKey].map((a) => (
                    <label key={a} className="ses-opt">
                      <input type="radio" name="attendance" value={a} checked={choice === a} onChange={() => setChoice(a)} />
                      <span><b>{ATTENDANCE_LABELS[a]}</b><small>{CHOICE_HINT[a]}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div><Button type="submit" variant="primary" size="lg" loading={busy}>Gửi xác nhận</Button></div>
              <p className="text-small text-ink-muted">Hạn xác nhận {formatDateTime(s.attendanceDeadline)}. Không xác nhận kịp, hệ thống tự xử lý theo xác nhận của bên kia.</p>
            </form>
          </section>
        )}

        {!mine && !open && s.status === "CONFIRMED" && !ended && (
          <Alert tone="info" title="Chưa đến lúc xác nhận">Xác nhận mở sau giờ kết thúc ({formatDateTime(s.endsAt)}).</Alert>
        )}

        {/* 2 · Chờ bên kia */}
        {mine && ["AWAITING_ATTENDANCE", "CONFIRMED"].includes(s.status) && (
          <section className="ses-sec" aria-label="Chờ bên kia xác nhận">
            <div className="ses-sec-head"><h2>Chờ {isMentor ? "mentee" : "mentor"} xác nhận</h2></div>
            <div className="ses-sec-body flex flex-col gap-4">
              <ol className="ses-steps">
                <li className="ses-step" data-state="done"><span className="ses-step-dot" aria-hidden="true"><CheckCircle2 /></span>
                  <div><b>Bạn đã xác nhận</b><div className="t">{ATTENDANCE_LABELS[mine]}</div></div></li>
                <li className="ses-step" data-state={theirs ? "done" : "now"}><span className="ses-step-dot" aria-hidden="true">{theirs ? <CheckCircle2 /> : <Clock />}</span>
                  <div><b>{theirs ? `${isMentor ? "Mentee" : "Mentor"} đã xác nhận` : `Chờ ${isMentor ? "mentee" : "mentor"} xác nhận`}</b>
                    <div className="t">{theirs ? ATTENDANCE_LABELS[theirs] : `Còn ${remaining(s.attendanceDeadline, now)}`}</div></div></li>
              </ol>
              <Alert tone="info">Trong lúc chờ, bạn có thể {isMentor ? "viết nhận xét về mentee" : "viết đánh giá"} và xem lại ghi chú phiên. Nếu bên kia không phản hồi kịp hạn, câu trả lời của bạn được áp dụng.</Alert>
              <div><ButtonLink href={`/mentoring/sessions/${s.id}/notes`}>Xem ghi chú phiên</ButtonLink></div>
            </div>
          </section>
        )}

        {/* 3 · Hoàn thành */}
        {s.status === "COMPLETED" && (
          <section className="ses-sec" aria-label="Hoàn thành">
            <div className="ses-sec-body">
              <div className="ses-bignote">
                <span className="ico" aria-hidden="true"><CheckCircle2 /></span>
                <h2 className="text-title-2 font-bold">Phiên đã hoàn thành</h2>
                <p className="text-ink-muted">
                  {Number(s.price) > 0 ? `Học phí ${formatMoney(s.price)} được giải phóng cho mentor sau thời gian chờ khiếu nại.` : "Phiên miễn phí."}
                  {s.attendanceResolution ? ` (${ATTENDANCE_RESOLUTION_LABELS[s.attendanceResolution]})` : ""}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {!s.reviewed && (isMentor || s.kind !== "TRIAL") && (
                  <ButtonLink href={`/mentoring/sessions/${s.id}/review`} variant="primary" icon={Star}>{isMentor ? "Đánh giá mentee" : "Đánh giá mentor"}</ButtonLink>
                )}
                <ButtonLink href={`/mentoring/sessions/${s.id}/notes`}>Ghi chú và việc cần làm</ButtonLink>
                {!isMentor && <ButtonLink href={`/mentoring/book/${s.mentorId}`}>Đặt phiên tiếp theo</ButtonLink>}
              </div>
            </div>
          </section>
        )}

        {/* 4 · Không khớp */}
        {s.status === "DISPUTED" && (
          <section className="ses-sec" aria-label="Hai bên không khớp">
            <div className="ses-sec-head"><h2>Hai bên không khớp</h2></div>
            <div className="ses-sec-body flex flex-col gap-4">
              <Alert tone="warning" title="Xác nhận của hai bên khác nhau">
                Bạn chọn “{mine ? ATTENDANCE_LABELS[mine] : "—"}”, {isMentor ? "mentee" : "mentor"} chọn “{theirs ? ATTENDANCE_LABELS[theirs] : "—"}”.{" "}
                {Number(s.price) > 0 ? "Học phí đang được giữ cho tới khi quản trị viên kết luận." : "Quản trị viên sẽ xem xét."}
              </Alert>
              {s.dispute ? (
                <Alert tone="info">Đã có báo cáo sự cố cho phiên này ({s.dispute.status === "RESOLVED" ? "đã giải quyết" : "đang xử lý"}). Quản trị viên phản hồi trong 48 giờ.</Alert>
              ) : (
                <DisputeForm session={s} onCancel={() => undefined} onDone={(ok) => { setMsg({ ok }); load(); }} />
              )}
            </div>
          </section>
        )}

        {/* Kết quả khác */}
        {["NO_SHOW_MENTEE", "NO_SHOW_MENTOR", "CANCELLED", "EXPIRED"].includes(s.status) && (
          <Alert tone="info" title={SESSION_STATUS_LABELS[s.status] ?? s.status}>
            Phiên đã được kết luận. {Number(s.price) > 0 && s.refundPercent !== null ? `Hoàn ${s.refundPercent}% về ví của mentee.` : ""}{" "}
            <Link href={`/mentoring/sessions/${s.id}`} className="font-semibold">Xem chi tiết phiên</Link>
          </Alert>
        )}
        {["PENDING", "AWAITING_MENTOR"].includes(s.status) && <Alert tone="info">Phiên chưa diễn ra nên chưa cần xác nhận.</Alert>}
      </div>
    </>
  );
}

export default function CompletePage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Complete user={user} />}</RequireAuth>;
}
