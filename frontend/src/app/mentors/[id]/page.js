"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, Stars, StatusBadge } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import IntroBooker from "@/features/mentoring/IntroBooker";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { DAY_NAMES, formatDate, formatDateTime, formatMoney, formatRate } from "@/lib/format";

/** Chọn cách thanh toán khi đặt lịch: dùng buổi trong gói, trả lẻ, hoặc mua gói mới. */
function PayModeTabs({ mode, setMode, packages }) {
  const modes = [
    ...(packages.length > 0 ? [["use", `Dùng gói (còn ${packages.reduce((n, p) => n + p.sessionsRemaining, 0)} buổi)`]] : []),
    ["single", "Buổi lẻ"],
    ["buy", "Mua gói tiết kiệm"],
  ];
  return (
    <div className="tabs" role="tablist" aria-label="Cách thanh toán">
      {modes.map(([value, label]) => (
        <button type="button" key={value} role="tab" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{label}</button>
      ))}
    </div>
  );
}

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
  // Gói buổi: các gói còn dùng được với mentor này, các mức gói có thể mua, và cách thanh toán đang chọn
  const [packages, setPackages] = useState([]);
  const [options, setOptions] = useState(null);
  const [mode, setMode] = useState("single");
  const [tier, setTier] = useState(null);

  const loadRequest = useCallback(() => {
    if (user.role !== "MENTEE") return;
    mentoringApi.requests().then((rs) => setRequest(rs.find((r) => r.mentorId === id && ["PENDING", "INTRO", "ACCEPTED"].includes(r.status)) || null));
  }, [id, user]);

  useEffect(() => {
    profileApi.getMentor(id).then(setMentor).catch(() => setMentor(null));
    mentoringApi.mentorReviews(id).then(setReviews).catch(() => {});
    loadRequest();
  }, [id, loadRequest]);

  const accepted = request?.status === "ACCEPTED";
  useEffect(() => {
    if (!accepted) return;
    mentoringApi.packages().then((ps) => {
      const usable = ps.filter((p) => p.mentorId === id && p.status === "ACTIVE" && p.sessionsRemaining > 0);
      setPackages(usable);
      if (usable.length > 0) {
        setMode("use");
        setBooking((b) => ({ ...b, durationMinutes: usable[0].durationMinutes }));
      }
    }).catch(() => {});
  }, [accepted, id]);

  useEffect(() => {
    if (!accepted) return;
    mentoringApi.packageOptions(id, booking.durationMinutes).then(setOptions).catch(() => setOptions(null));
  }, [accepted, id, booking.durationMinutes]);

  // Gói dùng được cho thời lượng đang chọn
  const usablePackage = useMemo(() => packages.find((p) => p.durationMinutes === booking.durationMinutes), [packages, booking.durationMinutes]);

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
        packageId: mode === "use" && usablePackage ? usablePackage.id : undefined,
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

  async function buyPackage(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      const pack = await mentoringApi.purchasePackage(id, tier, Number(booking.durationMinutes));
      router.push(`/payment/package/${pack.id}`);
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (mentor === undefined) return <Loading />;
  if (!mentor) return <Alert>Không tìm thấy mentor.</Alert>;
  const price = Math.round((Number(mentor.hourlyRate) * booking.durationMinutes) / 60 / 1000) * 1000;
  const paidMentor = Number(mentor.hourlyRate) > 0;
  const showModes = accepted && paidMentor && (packages.length > 0 || (options?.options?.length ?? 0) > 0);
  const effectiveMode = showModes ? mode : "single";
  const durationLocked = effectiveMode === "use" && usablePackage;

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
                <p className="muted small">Mentor có thể nhận ngay hoặc hẹn một buổi làm quen ngắn trước. Còn {Math.max(0, mentor.capacity - mentor.activeMenteeCount)} chỗ.</p>
                <div className="field"><label>Lời nhắn</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Giới thiệu ngắn về bạn và điều bạn mong muốn" maxLength={1000} /></div>
                <button className="btn" disabled={busy}>Gửi yêu cầu</button>
              </form>
            )}
            {request?.status === "PENDING" && <Alert type="info">Yêu cầu của bạn đang chờ mentor phản hồi.</Alert>}
            {request?.status === "INTRO" && (
              <div>
                <h2>Buổi làm quen</h2>
                {request.intro ? (
                  <>
                    <Alert type="info">
                      Buổi làm quen của bạn: <strong>{formatDateTime(request.intro.scheduledAt)}</strong> ({request.introDurationMinutes} phút, miễn phí).
                      Sau buổi này, hai bên chọn có tiếp tục hay không ở trang <Link href="/mentoring/requests">Yêu cầu</Link>.
                    </Alert>
                  </>
                ) : (
                  <>
                    <p className="muted small">Mentor muốn trò chuyện ngắn với bạn trước khi bắt đầu. Buổi này miễn phí và chưa chiếm chỗ của mentor.</p>
                    <IntroBooker request={request} onBooked={(r) => { setRequest(r); setMsg({ ok: "Đã đặt buổi làm quen." }); }} />
                  </>
                )}
              </div>
            )}
            {accepted && (
              <form onSubmit={effectiveMode === "buy" ? buyPackage : book}>
                <h2>{effectiveMode === "buy" ? "Mua gói buổi" : "Đặt lịch phiên mentoring"}</h2>
                {showModes && <PayModeTabs mode={effectiveMode} setMode={(m) => { setMode(m); setMsg({}); }} packages={packages} />}
                <div className="field">
                  <label>Thời lượng</label>
                  <select value={booking.durationMinutes} disabled={Boolean(durationLocked)} onChange={(e) => setBooking({ ...booking, durationMinutes: Number(e.target.value), scheduledAt: null })}>
                    {[30, 60, 90, 120].map((d) => <option key={d} value={d}>{d} phút</option>)}
                  </select>
                  {durationLocked && <div className="hint">Gói của bạn dành cho phiên {usablePackage.durationMinutes} phút.</div>}
                </div>

                {effectiveMode === "buy" ? (
                  <>
                    <div className="field">
                      <label>Chọn gói <span className="muted small">(mỗi buổi {booking.durationMinutes} phút, dùng trong {options?.options?.[0]?.validityDays ?? 90} ngày)</span></label>
                      <div className="stack" style={{ gap: 8 }}>
                        {(options?.options || []).map((o) => (
                          <label key={o.sessions} className="card" style={{ cursor: "pointer", boxShadow: "none", border: tier === o.sessions ? "2px solid var(--primary, #4263eb)" : undefined, padding: "0.75rem 1rem" }}>
                            <div className="row between">
                              <span><input type="radio" name="tier" checked={tier === o.sessions} onChange={() => setTier(o.sessions)} /> <strong>{o.sessions} buổi</strong> <span className="badge good">giảm {o.discountPercent}%</span></span>
                              <strong>{formatMoney(o.totalPrice)}</strong>
                            </div>
                            <div className="muted small">{formatMoney(o.unitPrice)}/buổi · tiết kiệm {formatMoney(o.savings)} so với mua lẻ ({formatMoney(options.singlePrice)}/buổi)</div>
                          </label>
                        ))}
                      </div>
                      <div className="hint">Buổi chưa dùng khi gói hết hạn hoặc bị huỷ sẽ được hoàn tiền.</div>
                    </div>
                    <button className="btn" disabled={busy || !tier}>{busy ? "Đang tạo gói..." : "Mua gói & thanh toán"}</button>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Thời gian bắt đầu <span className="muted small">(giờ Việt Nam)</span></label>
                      <SlotPicker mentorId={id} durationMinutes={booking.durationMinutes} value={booking.scheduledAt} onChange={pickSlot} refreshKey={slotsVersion} />
                    </div>
                    <div className="field"><label>Chủ đề</label><input value={booking.topic} onChange={(e) => setBooking({ ...booking, topic: e.target.value })} maxLength={300} placeholder="Ví dụ: review CV, luyện phỏng vấn" /></div>
                    <p>
                      <span className="small">{booking.scheduledAt ? `${formatDateTime(booking.scheduledAt)} · ${booking.durationMinutes} phút` : <span className="muted">Chọn một khung giờ để tiếp tục</span>}<br /></span>
                      {effectiveMode === "use" && usablePackage
                        ? <strong>Dùng 1 buổi trong gói (còn {usablePackage.sessionsRemaining}) · không thu thêm tiền</strong>
                        : <strong>Chi phí: {formatMoney(price)}</strong>}
                    </p>
                    <button className="btn" disabled={busy || !booking.scheduledAt}>
                      {busy ? "Đang kiểm tra lịch..." : effectiveMode === "use" ? "Xác nhận dùng gói" : price > 0 ? "Xác nhận & thanh toán" : "Xác nhận đặt lịch"}
                    </button>
                  </>
                )}
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
