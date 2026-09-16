"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Stars, StatusBadge, useDialog } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { formatDateTime, formatMoney } from "@/lib/format";

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

function Sessions({ user }) {
  const params = useSearchParams();
  const [items, setItems] = useState(undefined);
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState(null);
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
            return (
              <div key={s.id} className="list-item" style={{ flexDirection: "column" }}>
                <div className="row" style={{ width: "100%" }}>
                  <div style={{ flex: 1 }}>
                    <div className="row">
                      <strong>{isMentor ? s.menteeName : <Link href={`/mentors/${s.mentorId}`}>{s.mentorName}</Link>}</strong>
                      <StatusBadge status={s.status} />
                      {s.reviewed && <Stars value={s.reviewRating} />}
                    </div>
                    <div className="muted small">
                      {formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút · {formatMoney(s.price)}
                      {s.topic && ` · ${s.topic}`}
                    </div>
                  </div>
                  <div className="row">
                    {!isMentor && s.status === "PENDING" && <Link className="btn sm" href={`/payment/${s.id}`}>Thanh toán</Link>}
                    {isMentor && s.status === "CONFIRMED" && (
                      <button className="btn good sm" onClick={() => act(() => mentoringApi.completeSession(s.id), "Đã đánh dấu hoàn thành")}>Đánh dấu hoàn thành</button>
                    )}
                    {["PENDING", "CONFIRMED"].includes(s.status) && future && (
                      <button className="btn secondary sm" onClick={async () => {
                        const refund = s.status === "CONFIRMED" && Number(s.price) > 0;
                        const reason = await ask({ title: "Huỷ phiên mentoring?", message: refund ? `Khoản thanh toán ${formatMoney(s.price)} sẽ được hoàn lại.` : undefined, input: { label: "Lý do huỷ (tuỳ chọn)", maxLength: 300 }, confirmText: "Huỷ phiên", cancelText: "Giữ phiên", danger: true });
                        if (reason !== null) act(() => mentoringApi.cancelSession(s.id, reason), refund ? "Đã huỷ phiên, khoản thanh toán được hoàn lại." : "Đã huỷ phiên");
                      }}>Huỷ</button>
                    )}
                    {!isMentor && s.status === "COMPLETED" && !s.reviewed && (
                      <button className="btn sm" onClick={() => setReviewing(reviewing === s.id ? null : s.id)}>Đánh giá</button>
                    )}
                  </div>
                </div>
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
