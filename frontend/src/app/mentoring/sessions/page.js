"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Stars, StatusBadge, useDialog } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

function ReviewForm({ session, onDone }) {
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
          setError(err.message);
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

/**
 * Đổi lịch một phiên đã xác nhận. Báo trước cho người dùng kết quả sẽ là "dời ngay" hay "gửi đề xuất cho bên kia",
 * theo cùng quy tắc mà mentoring-service áp dụng (số giờ còn lại so với cửa sổ đổi miễn phí, và số lần đã đổi).
 */
function ReschedulePanel({ session, user, onDone }) {
  const isMentor = user.role === "MENTOR";
  const [slot, setSlot] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = useCallback((v) => setSlot(v), []);
  const hoursLeft = (new Date(session.scheduledAt) - Date.now()) / 3600000;
  const freeLeft = Math.max(0, session.rescheduleLimit - session.rescheduleCount);
  const direct = !isMentor && hoursLeft >= session.freeRescheduleHours && freeLeft > 0;
  const otherName = isMentor ? session.menteeName : session.mentorName;

  let hint;
  if (isMentor) hint = `Mentee cần đồng ý với giờ mới. Phiên giữ nguyên lịch cũ cho tới khi ${otherName} đồng ý.`;
  else if (direct) hint = `Phiên sẽ được dời ngay. Bạn còn ${freeLeft}/${session.rescheduleLimit} lần đổi lịch tự do cho phiên này.`;
  else if (freeLeft === 0) hint = `Bạn đã dùng hết ${session.rescheduleLimit} lần đổi tự do, nên cần ${otherName} đồng ý với giờ mới.`;
  else hint = `Còn dưới ${session.freeRescheduleHours} giờ nữa là tới phiên, nên cần ${otherName} đồng ý với giờ mới.`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await mentoringApi.reschedule(session.id, slot);
      onDone(res.proposedAt ? `Đã gửi đề xuất đổi lịch tới ${otherName}.` : "Đã dời lịch phiên.");
    } catch (err) {
      setError(err.message);
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8 }} onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Đổi lịch</h3>
      <Alert>{error}</Alert>
      <p className="small muted">Hiện tại: {formatDateTime(session.scheduledAt)} · {session.durationMinutes} phút. {session.packageId ? "Buổi trong gói được giữ nguyên, không mất buổi." : Number(session.price) > 0 ? "Khoản đã thanh toán được giữ nguyên." : ""}</p>
      <SlotPicker mentorId={session.mentorId} durationMinutes={session.durationMinutes} value={slot} onChange={pick} refreshKey={version} excludeSessionId={session.id} />
      <p className="small" style={{ marginTop: 8 }}>{hint}</p>
      <button className="btn sm" disabled={busy || !slot}>{busy ? "Đang xử lý..." : direct ? "Dời lịch" : "Gửi đề xuất"}</button>
    </form>
  );
}

/** Đề xuất đổi lịch đang chờ: bên nhận đồng ý/từ chối, bên đề xuất có thể rút lại. */
function ProposalBanner({ session, user, act }) {
  const mine = session.proposedBy === user.userId;
  const proposer = session.proposedBy === session.menteeId ? session.menteeName : session.mentorName;
  const other = user.role === "MENTOR" ? session.menteeName : session.mentorName;
  return (
    <div className="alert info" style={{ width: "100%", margin: "8px 0 0" }}>
      {mine ? (
        <>
          <div>Bạn đã đề xuất dời phiên sang <strong>{formatDateTime(session.proposedAt)}</strong>, đang chờ {other} trả lời.</div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn secondary sm" onClick={() => act(() => mentoringApi.respondReschedule(session.id, false), "Đã rút lại đề xuất")}>Rút lại đề xuất</button>
          </div>
        </>
      ) : (
        <>
          <div>{proposer} đề xuất dời phiên từ {formatDateTime(session.scheduledAt)} sang <strong>{formatDateTime(session.proposedAt)}</strong>.</div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn good sm" onClick={() => act(() => mentoringApi.respondReschedule(session.id, true), "Đã đồng ý, phiên được dời lịch")}>Đồng ý</button>
            <button className="btn danger sm" onClick={() => act(() => mentoringApi.respondReschedule(session.id, false), "Đã từ chối đề xuất, phiên giữ nguyên lịch")}>Từ chối</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Gói buổi đã mua: số buổi còn lại, hạn dùng, thanh toán/huỷ và tình trạng hoàn tiền. */
function Packages({ user, ask, act }) {
  const [items, setItems] = useState(undefined);
  const isMentor = user.role === "MENTOR";
  useEffect(() => {
    mentoringApi.packages().then(setItems).catch(() => setItems([]));
  }, []);
  if (!items) return null;
  const open = items.filter((p) => ["PENDING_PAYMENT", "ACTIVE"].includes(p.status) || p.refundPending);
  if (open.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h2>{isMentor ? "Gói buổi của mentee" : "Gói buổi của bạn"}</h2>
      {open.map((p) => {
        const unused = p.sessionsRemaining * Number(p.unitPrice);
        return (
          <div key={p.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="row" style={{ width: "100%" }}>
              <div style={{ flex: 1 }}>
                <div className="row">
                  <strong>Gói {p.sessionsTotal} buổi · {isMentor ? p.menteeName : <Link href={`/mentors/${p.mentorId}`}>{p.mentorName}</Link>}</strong>
                  <StatusBadge status={p.status} />
                </div>
                <div className="muted small">
                  {p.status === "ACTIVE" && <>Còn <strong>{p.sessionsRemaining}/{p.sessionsTotal}</strong> buổi {p.durationMinutes} phút · hết hạn {formatDate(p.expiresAt)} · </>}
                  {formatMoney(p.unitPrice)}/buổi (giảm {p.discountPercent}%) · tổng {formatMoney(p.totalPrice)}
                </div>
                {p.refundPending && <div className="small">Đang hoàn lại {formatMoney(Number(p.refundDue) - Number(p.refundedAmount))} cho các buổi chưa dùng.</div>}
              </div>
              {!isMentor && (
                <div className="row">
                  {p.status === "PENDING_PAYMENT" && <Link className="btn sm" href={`/payment/package/${p.id}`}>Thanh toán</Link>}
                  {p.status === "ACTIVE" && p.sessionsRemaining > 0 && <Link className="btn sm" href={`/mentors/${p.mentorId}`}>Đặt buổi</Link>}
                  {["PENDING_PAYMENT", "ACTIVE"].includes(p.status) && (
                    <button className="btn secondary sm" onClick={async () => {
                      const ok = await ask({
                        title: "Huỷ gói buổi?",
                        message: p.status === "ACTIVE"
                          ? `${p.sessionsRemaining} buổi chưa dùng sẽ được hoàn ${formatMoney(unused)}. Các buổi đã đặt vẫn giữ nguyên.`
                          : "Gói chưa thanh toán nên không phát sinh hoàn tiền.",
                        confirmText: "Huỷ gói", cancelText: "Giữ gói", danger: true,
                      });
                      if (ok) act(() => mentoringApi.cancelPackage(p.id), "Đã huỷ gói");
                    }}>Huỷ gói</button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sessions({ user }) {
  const params = useSearchParams();
  const [items, setItems] = useState(undefined);
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const [version, setVersion] = useState(0);
  const [dialog, ask] = useDialog();
  const [msg, setMsg] = useState(params.get("booked") ? { ok: "Đặt lịch thành công!" } : params.get("paid") ? { ok: "Thanh toán thành công, phiên đã được xác nhận." } : {});
  const isMentor = user.role === "MENTOR";
  const load = useCallback(() => mentoringApi.sessions(filter).then(setItems), [filter]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, ok) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      setVersion((v) => v + 1); // tải lại cả danh sách gói
      load();
    } catch (e) {
      setMsg({ error: e.message });
    }
  }

  return (
    <>
      <PageHead title="Phiên mentoring" subtitle="Lịch sử và các phiên sắp tới của bạn." />
      {dialog}
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <Packages key={version} user={user} ask={ask} act={act} />
      <div className="tabs">
        {[["", "Tất cả"], ["PENDING", "Chờ thanh toán"], ["CONFIRMED", "Đã xác nhận"], ["COMPLETED", "Hoàn thành"], ["CANCELLED", "Đã huỷ"]].map(([v, l]) => (
          <button key={v} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {items === undefined ? <Loading /> : (
        <div className="card">
          {items.length === 0 && <Empty>Chưa có phiên nào.</Empty>}
          {items.map((s) => {
            const future = new Date(s.scheduledAt) > new Date();
            const isIntro = s.type === "INTRO";
            const fromPackage = Boolean(s.packageId);
            return (
              <div key={s.id} className="list-item" style={{ flexDirection: "column" }}>
                <div className="row" style={{ width: "100%" }}>
                  <div style={{ flex: 1 }}>
                    <div className="row">
                      <strong>{isMentor ? s.menteeName : <Link href={`/mentors/${s.mentorId}`}>{s.mentorName}</Link>}</strong>
                      <StatusBadge status={s.status} />
                      {isIntro && <span className="badge neutral">Làm quen</span>}
                      {fromPackage && <span className="badge neutral">Dùng gói</span>}
                      {s.reviewed && <Stars value={s.reviewRating} />}
                    </div>
                    <div className="muted small">
                      {formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút · {fromPackage ? "Trong gói" : formatMoney(s.price)}
                      {s.topic && ` · ${s.topic}`}
                      {s.rescheduleCount > 0 && ` · đã đổi lịch ${s.rescheduleCount} lần`}
                    </div>
                  </div>
                  <div className="row">
                    {!isMentor && s.status === "PENDING" && <Link className="btn sm" href={`/payment/${s.id}`}>Thanh toán</Link>}
                    {isMentor && s.status === "CONFIRMED" && (
                      <button className="btn good sm" onClick={() => act(() => mentoringApi.completeSession(s.id), "Đã đánh dấu hoàn thành")}>Đánh dấu hoàn thành</button>
                    )}
                    {s.status === "CONFIRMED" && future && (
                      <button className="btn secondary sm" onClick={() => setRescheduling(rescheduling === s.id ? null : s.id)}>Đổi lịch</button>
                    )}
                    {["PENDING", "CONFIRMED"].includes(s.status) && future && (
                      <button className="btn secondary sm" onClick={async () => {
                        const refund = s.status === "CONFIRMED" && Number(s.price) > 0;
                        const credit = s.status === "CONFIRMED" && fromPackage;
                        const reason = await ask({
                          title: "Huỷ phiên mentoring?",
                          message: refund ? `Khoản thanh toán ${formatMoney(s.price)} sẽ được hoàn lại.` : credit ? "Buổi này sẽ được trả lại vào gói của mentee." : undefined,
                          input: { label: "Lý do huỷ (tuỳ chọn)", maxLength: 300 }, confirmText: "Huỷ phiên", cancelText: "Giữ phiên", danger: true,
                        });
                        if (reason !== null) act(() => mentoringApi.cancelSession(s.id, reason), refund ? "Đã huỷ phiên, khoản thanh toán được hoàn lại." : credit ? "Đã huỷ phiên, buổi được trả lại vào gói." : "Đã huỷ phiên");
                      }}>Huỷ</button>
                    )}
                    {!isMentor && s.status === "COMPLETED" && !s.reviewed && !isIntro && (
                      <button className="btn sm" onClick={() => setReviewing(reviewing === s.id ? null : s.id)}>Đánh giá</button>
                    )}
                  </div>
                </div>
                {s.status === "CONFIRMED" && future && s.proposedAt && <ProposalBanner session={s} user={user} act={act} />}
                {rescheduling === s.id && (
                  <div style={{ width: "100%" }}>
                    <ReschedulePanel session={s} user={user} onDone={(ok) => { setRescheduling(null); setMsg({ ok }); load(); }} />
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
