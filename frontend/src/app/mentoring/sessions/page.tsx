"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Stars, useDialog, Flash, type AskFn } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import {
  ATTENDANCE_CHOICES,
  ATTENDANCE_LABELS,
  ATTENDANCE_RESOLUTION_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
} from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { AttendanceAnswer, CancelPreview, MentoringSession, SessionPackage, SessionStatus, SessionUser } from "@/types";

function ReviewForm({ session, onDone }: { session: MentoringSession; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="card"
      style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await mentoringApi.review(session.id, rating, comment);
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <Alert>{error}</Alert>
      <div className="row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} className="btn ghost sm" style={{ fontSize: "1.3rem", padding: 0, color: "#f59f00" }} onClick={() => setRating(n)}>
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
        <span className="small muted">{rating}/5</span>
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Nhận xét về buổi mentoring" maxLength={2000} style={{ minHeight: 70, marginTop: 6 }} />
      <button className="btn sm" style={{ marginTop: 6 }}>Gửi đánh giá</button>
    </form>
  );
}

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
      <div className="alert info" style={{ width: "100%", marginTop: 8 }}>
        Bạn đã xác nhận: <strong>{ATTENDANCE_LABELS[mine]}</strong>.{" "}
        {other ? "" : `Đang chờ ${isMentor ? "mentee" : "mentor"} xác nhận (hạn ${deadline}); nếu không phản hồi, câu trả lời của bạn được áp dụng.`}
      </div>
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
    <div className="alert warn" style={{ width: "100%", marginTop: 8 }}>
      <strong>Phiên đã kết thúc — phiên có diễn ra không?</strong> Hạn xác nhận: {deadline}.
      {other && <> {isMentor ? "Mentee" : "Mentor"} đã xác nhận.</>}
      <div className="row" style={{ marginTop: 6 }}>
        {ATTENDANCE_CHOICES[isMentor ? "MENTOR" : "MENTEE"].map((a) => (
          <button key={a} className={`btn sm ${a === "HELD" ? "good" : "secondary"}`} onClick={() => choose(a)}>
            {ATTENDANCE_LABELS[a]}
          </button>
        ))}
      </div>
    </div>
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

/** US-06 — chọn giờ mới để đề xuất dời lịch. */
function RescheduleForm({ session, onDone }: { session: MentoringSession; onDone: (ok: string) => void }) {
  const [newStart, setNewStart] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const pick = useCallback((v: string | null) => setNewStart(v), []);
  return (
    <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8 }}>
      <Alert>{error}</Alert>
      <p className="small muted">Chọn giờ mới ({session.durationMinutes} phút, giữ nguyên chi phí). Bên còn lại cần đồng ý trong 24 giờ (và trước giờ bắt đầu cũ 1 giờ).</p>
      <SlotPicker mentorId={session.mentorId} durationMinutes={session.durationMinutes} value={newStart} onChange={pick}
        refreshKey={version} excludeSessionId={session.id} />
      <button className="btn sm" style={{ marginTop: 6 }} disabled={!newStart || busy} onClick={async () => {
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
      }}>Gửi đề xuất dời lịch</button>
    </div>
  );
}

/** Gói buổi của người dùng: còn bao nhiêu buổi, hạn dùng, hoàn tiền; mentee có thể thanh toán / huỷ gói. */
function PackagesCard({ packages, isMentor, onCancel }: {
  packages: SessionPackage[];
  isMentor: boolean;
  onCancel: (p: SessionPackage) => void;
}) {
  if (packages.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Gói buổi</h2>
      {packages.map((p) => (
        <div key={p.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div className="row" style={{ width: "100%" }}>
            <div style={{ flex: 1 }}>
              <div className="row">
                <strong>{isMentor ? p.menteeName : <Link href={`/mentors/${p.mentorId}`}>{p.mentorName}</Link>}</strong>
                <MentoringStatusBadge status={p.status} />
                <span className="muted small">{p.sessionsTotal} buổi × {p.durationMinutes} phút · {formatMoney(p.totalPrice)}</span>
              </div>
              <div className="small">
                {p.status === "ACTIVE" || p.status === "EXHAUSTED" ? <>Còn <strong>{p.sessionsRemaining}/{p.sessionsTotal}</strong> buổi</> : null}
                {p.expiresAt && p.status === "ACTIVE" && <span className="muted"> · hết hạn {formatDateTime(p.expiresAt)}</span>}
                {p.status === "PENDING_PAYMENT" && <span className="muted">Chờ thanh toán (tự huỷ sau 30 phút)</span>}
              </div>
              {Number(p.refundDue) > 0 && (
                <div className="small muted">
                  Hoàn tiền buổi chưa dùng: {formatMoney(p.refundedAmount)}/{formatMoney(p.refundDue)}{p.refundPending ? " (đang xử lý)" : ""}
                </div>
              )}
            </div>
            {!isMentor && (
              <div className="row">
                {p.status === "PENDING_PAYMENT" && <Link className="btn sm" href={`/payment/package/${p.id}`}>Thanh toán</Link>}
                {p.status === "ACTIVE" && <Link className="btn sm" href={`/mentoring/book/${p.mentorId}`}>Đặt buổi</Link>}
                {(p.status === "ACTIVE" || p.status === "PENDING_PAYMENT") && (
                  <button className="btn secondary sm" onClick={() => onCancel(p)}>Huỷ gói</button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Sessions({ user }: { user: SessionUser }) {
  const params = useSearchParams();
  const [items, setItems] = useState<MentoringSession[] | undefined>(undefined);
  const [filter, setFilter] = useState<SessionStatus | "">("");
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [dialog, ask] = useDialog();
  const [msg, setMsg] = useState<Flash>(params.get("booked") ? { ok: "Đặt lịch thành công!" } : params.get("paid") ? { ok: "Thanh toán thành công, phiên đã được xác nhận." } : params.get("packagePaid") ? { ok: "Thanh toán gói thành công. Bạn có thể đặt từng buổi trong gói." } : {});
  const isMentor = user.role === "MENTOR";
  const load = useCallback(
    () => {
      mentoringApi.packages().then(setPackages).catch(() => {});
      return mentoringApi.sessions(filter).then(setItems).catch((e) => { setItems((cur) => cur ?? []); setMsg({ error: errorMessage(e) }); });
    },
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
      <PageHead title="Phiên mentoring" subtitle="Lịch sử và các phiên sắp tới của bạn." />
      {dialog}
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <PackagesCard packages={packages} isMentor={isMentor} onCancel={async (p) => {
        const paid = p.status === "ACTIVE";
        const ok = await ask({
          title: "Huỷ gói buổi?",
          message: paid
            ? `Các buổi chưa dùng (${p.sessionsRemaining} buổi × ${formatMoney(p.unitPrice)}) sẽ được hoàn tiền. Những phiên đã đặt vẫn giữ nguyên.`
            : "Gói chưa thanh toán sẽ bị huỷ.",
          confirmText: "Huỷ gói", cancelText: "Giữ gói", danger: true,
        });
        if (ok) act(() => mentoringApi.cancelPackage(p.id), paid ? "Đã huỷ gói, tiền các buổi chưa dùng đang được hoàn lại." : "Đã huỷ gói");
      }} />
      <div className="tabs">
        {FILTERS.map(([v, l]) => (
          <button key={v} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {items === undefined ? <Loading /> : (
        <div className="card">
          {items.length === 0 && <Empty>Chưa có phiên nào.</Empty>}
          {items.map((s) => {
            const future = new Date(s.scheduledAt) > new Date();
            return (
              <div key={s.id} className="list-item" style={{ flexDirection: "column" }}>
                <div className="row" style={{ width: "100%" }}>
                  <div style={{ flex: 1 }}>
                    <div className="row">
                      <strong>{isMentor ? s.menteeName : <Link href={`/mentors/${s.mentorId}`}>{s.mentorName}</Link>}</strong>
                      <MentoringStatusBadge status={s.status} labels={SESSION_STATUS_LABELS} />
                      {s.kind === "INTRO" && <span className="badge neutral">Buổi làm quen</span>}
                      {s.packageId && <span className="badge neutral">Dùng gói</span>}
                      {s.reviewed && <Stars value={s.reviewRating} />}
                    </div>
                    <div className="muted small">
                      {formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút · {formatMoney(s.price)}
                      {s.sessionType && ` · ${SESSION_TYPE_LABELS[s.sessionType]}`}
                      {s.topic && ` · ${s.topic}`}
                    </div>
                    {s.status === "CONFIRMED" && s.meetingLink && !canJoin(s) && future && (
                      <div className="small muted">Nút “Tham gia” mở từ 15 phút trước giờ bắt đầu.</div>
                    )}
                    {outcomeText(s) && <div className="small muted">{outcomeText(s)}</div>}
                    {s.agenda && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{s.agenda}</div>}
                    {s.preReadLink && <div className="small"><a href={s.preReadLink} target="_blank" rel="noreferrer">Tài liệu đọc trước</a></div>}
                  </div>
                  <div className="row">
                    {!isMentor && s.status === "PENDING" && <Link className="btn sm" href={`/payment/${s.id}`}>Thanh toán</Link>}
                    {s.status === "CONFIRMED" && s.meetingLink && canJoin(s) && (
                      <a className="btn good sm" href={s.meetingLink} target="_blank" rel="noreferrer">Tham gia</a>
                    )}
                    {isMentor && ["PENDING", "CONFIRMED"].includes(s.status) && future && (
                      <button className="btn secondary sm" onClick={async () => {
                        const link = await ask({ title: "Link phòng họp cho phiên này", message: "Hỗ trợ https Google Meet, Zoom hoặc Microsoft Teams.", input: { label: "Link phòng họp", defaultValue: s.meetingLink || "", maxLength: 500, placeholder: "https://meet.google.com/..." }, confirmText: "Lưu link" });
                        if (link) act(() => mentoringApi.updateMeetingLink(s.id, link.trim()), "Đã cập nhật link phòng họp");
                      }}>Link họp</button>
                    )}
                    {["PENDING", "CONFIRMED"].includes(s.status) && future && (
                      <button className="btn secondary sm" onClick={async () => {
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
                        const reason = await ask({ title: "Huỷ phiên mentoring?", message: <>{refundLine && <strong>{refundLine}<br /></strong>}{preview.policyText}</>, input: { label: "Lý do huỷ (tuỳ chọn)", maxLength: 300 }, confirmText: "Huỷ phiên", cancelText: "Giữ phiên", danger: true });
                        if (reason !== null) act(() => mentoringApi.cancelSession(s.id, reason), Number(preview.refundAmount) > 0 ? `Đã huỷ phiên, ${formatMoney(preview.refundAmount)} sẽ được hoàn lại.` : "Đã huỷ phiên");
                      }}>Huỷ</button>
                    )}
                    {s.status === "CONFIRMED" && !s.pendingReschedule && s.rescheduleCount < 2
                      && new Date(s.scheduledAt).getTime() - Date.now() >= 2 * 3600 * 1000 && (
                      <button className="btn secondary sm" onClick={() => setRescheduling(rescheduling === s.id ? null : s.id)}>Dời lịch</button>
                    )}
                    {!isMentor && s.status === "COMPLETED" && !s.reviewed && s.kind !== "INTRO" && (
                      <button className="btn sm" onClick={() => setReviewing(reviewing === s.id ? null : s.id)}>Đánh giá</button>
                    )}
                  </div>
                </div>
                {attendanceOpen(s) && <AttendancePrompt session={s} isMentor={isMentor} ask={ask} act={act} />}
                {s.pendingReschedule && (
                  <div className="alert info" style={{ width: "100%", marginTop: 8 }}>
                    Đề xuất dời sang <strong>{formatDateTime(s.pendingReschedule.newStart)}</strong> · hết hạn {formatDateTime(s.pendingReschedule.expiresAt)}
                    <div className="row" style={{ marginTop: 6 }}>
                      {s.pendingReschedule.proposedBy === user.userId ? (
                        <button className="btn secondary sm" onClick={() => s.pendingReschedule && act(() => mentoringApi.declineReschedule(s.pendingReschedule!.id), "Đã rút lại đề xuất dời lịch")}>Rút lại đề xuất</button>
                      ) : (
                        <>
                          <button className="btn good sm" onClick={() => s.pendingReschedule && act(() => mentoringApi.acceptReschedule(s.pendingReschedule!.id), "Đã đồng ý dời lịch")}>Đồng ý</button>
                          <button className="btn danger sm" onClick={() => s.pendingReschedule && act(() => mentoringApi.declineReschedule(s.pendingReschedule!.id), "Đã từ chối đề xuất dời lịch")}>Từ chối</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {rescheduling === s.id && (
                  <div style={{ width: "100%" }}>
                    <RescheduleForm session={s} onDone={(ok) => { setRescheduling(null); setMsg({ ok }); load(); }} />
                  </div>
                )}
                {reviewing === s.id && (
                  <div style={{ width: "100%" }}>
                    <ReviewForm session={s} onDone={() => { setReviewing(null); setMsg({ ok: "Cảm ơn bạn đã đánh giá!" }); load(); }} />
                  </div>
                )}
              </div>
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
