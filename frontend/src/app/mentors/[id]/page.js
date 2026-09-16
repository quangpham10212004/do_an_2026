"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, Stars, StatusBadge } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { DAY_NAMES, formatDate, formatDateTime, formatMoney, formatRate } from "@/lib/format";

function MentorDetail({ user, id }) {
  const router = useRouter();
  const [mentor, setMentor] = useState(undefined);
  const [reviews, setReviews] = useState([]);
  const [request, setRequest] = useState(null);
  const [message, setMessage] = useState("");
  const [booking, setBooking] = useState({ scheduledAt: null, durationMinutes: 60, topic: "" });
  const [slotsVersion, setSlotsVersion] = useState(0);
  const pickSlot = useCallback((scheduledAt) => setBooking((b) => ({ ...b, scheduledAt })), []);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    profileApi.getMentor(id).then(setMentor).catch(() => setMentor(null));
    mentoringApi.mentorReviews(id).then(setReviews).catch(() => {});
    if (user.role === "MENTEE") {
      mentoringApi.requests().then((rs) => setRequest(rs.find((r) => r.mentorId === id && ["PENDING", "ACCEPTED"].includes(r.status)) || null));
    }
  }, [id, user]);

  async function sendRequest(e) {
    e.preventDefault();
    setBusy(true);
    try {
      setRequest(await mentoringApi.createRequest(id, message));
      setMsg({ ok: "Đã gửi yêu cầu. Bạn sẽ nhận thông báo khi mentor phản hồi." });
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function book(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      const session = await mentoringApi.book({
        menteeId: user.userId,
        mentorId: id,
        scheduledAt: booking.scheduledAt,
        durationMinutes: Number(booking.durationMinutes),
        topic: booking.topic,
      });
      if (session.status === "PENDING") router.push(`/payment/${session.id}`);
      else router.push("/mentoring/sessions?booked=1");
    } catch (err) {
      setMsg({ error: err.message });
      setSlotsVersion((v) => v + 1); // khung giờ có thể vừa bị người khác đặt → tải lại
    } finally {
      setBusy(false);
    }
  }

  if (mentor === undefined) return <Loading />;
  if (!mentor) return <Alert>Không tìm thấy mentor.</Alert>;
  const price = Math.round((Number(mentor.hourlyRate) * booking.durationMinutes) / 60 / 1000) * 1000;

  return (
    <>
      <PageHead title={mentor.displayName} subtitle={`${mentor.domain} · ${mentor.yearsExperience} năm kinh nghiệm · ${formatRate(mentor.hourlyRate)}`}>
        <StatusBadge status={mentor.verificationStatus} />
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card">
            <h2>Giới thiệu</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{mentor.bio}</p>
            <div className="chips">{mentor.skills.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
            {mentor.portfolioLinks.length > 0 && (
              <ul className="small" style={{ marginTop: "0.75rem" }}>
                {mentor.portfolioLinks.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer">{l}</a></li>)}
              </ul>
            )}
          </div>
          <div className="card">
            <h2>Lịch rảnh hằng tuần</h2>
            {mentor.availability.length === 0 && <p className="muted">Mentor chưa khai báo lịch rảnh.</p>}
            {mentor.availability.map((s) => (
              <div key={s.id} className="row between small list-item">
                <span>{DAY_NAMES[s.dayOfWeek]}</span>
                <span>{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Đánh giá ({mentor.ratingCount})</h2>
            {mentor.ratingCount > 0 && <p><Stars value={mentor.rating} /> {mentor.rating.toFixed(1)}/5</p>}
            {reviews.length === 0 && <p className="muted">Chưa có đánh giá.</p>}
            {reviews.map((r) => (
              <div key={r.id} className="list-item">
                <div>
                  <div className="row"><Stars value={r.rating} /><strong className="small">{r.menteeName}</strong><span className="muted small">{formatDate(r.createdAt)}</span></div>
                  {r.comment && <div className="small">{r.comment}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {user.role === "MENTEE" && (
          <div className="card">
            {!request && (
              <form onSubmit={sendRequest}>
                <h2>Gửi yêu cầu mentoring</h2>
                <p className="muted small">Mentor cần chấp nhận yêu cầu trước khi bạn đặt lịch. Còn {Math.max(0, mentor.capacity - mentor.activeMenteeCount)} chỗ.</p>
                <div className="field"><label>Lời nhắn</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Giới thiệu ngắn về bạn và điều bạn mong muốn" maxLength={1000} /></div>
                <button className="btn" disabled={busy}>Gửi yêu cầu</button>
              </form>
            )}
            {request?.status === "PENDING" && <Alert type="info">Yêu cầu của bạn đang chờ mentor phản hồi.</Alert>}
            {request?.status === "ACCEPTED" && (
              <form onSubmit={book}>
                <h2>Đặt lịch phiên mentoring</h2>
                <div className="field">
                  <label>Thời lượng</label>
                  <select value={booking.durationMinutes} onChange={(e) => setBooking({ ...booking, durationMinutes: Number(e.target.value) })}>
                    {[30, 60, 90, 120].map((d) => <option key={d} value={d}>{d} phút</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Thời gian bắt đầu <span className="muted small">(giờ Việt Nam)</span></label>
                  <SlotPicker mentorId={id} durationMinutes={booking.durationMinutes} value={booking.scheduledAt} onChange={pickSlot} refreshKey={slotsVersion} />
                </div>
                <div className="field"><label>Chủ đề</label><input value={booking.topic} onChange={(e) => setBooking({ ...booking, topic: e.target.value })} maxLength={300} placeholder="Ví dụ: review CV, luyện phỏng vấn" /></div>
                <p>
                  <span className="small">{booking.scheduledAt ? `${formatDateTime(booking.scheduledAt)} · ${booking.durationMinutes} phút` : <span className="muted">Chọn một khung giờ để tiếp tục</span>}<br /></span>
                  <strong>Chi phí: {formatMoney(price)}</strong>
                </p>
                <button className="btn" disabled={busy || !booking.scheduledAt}>{busy ? "Đang kiểm tra lịch..." : price > 0 ? "Xác nhận & thanh toán" : "Xác nhận đặt lịch"}</button>
              </form>
            )}
            <p className="small" style={{ marginTop: "1rem" }}><Link href="/matching">← Quay lại danh sách gợi ý</Link></p>
          </div>
        )}
      </div>
    </>
  );
}

export default function MentorDetailPage({ params }) {
  return <RequireAuth>{(user) => <MentorDetail user={user} id={params.id} />}</RequireAuth>;
}
