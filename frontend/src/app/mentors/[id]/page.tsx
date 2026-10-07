"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, Stars, StatusBadge, Flash } from "@/components/ui";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, exceptionTimeLabel, formatLocalDate, mentorStatusText, profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import { DAY_NAMES, formatDate, formatRate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MentorProfile, MentoringRequest, Review, SessionUser } from "@/types";

function MentorDetail({ user, id }: { user: SessionUser; id: string }) {
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [request, setRequest] = useState<MentoringRequest | null>(null);
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    profileApi.getMentor(id).then(setMentor).catch(() => setMentor(null));
    mentoringApi.mentorReviews(id).then(setReviews).catch(() => {});
    if (user.role === "MENTEE") {
      mentoringApi.requests().then((rs) => setRequest(rs.find((r) => r.mentorId === id && ["PENDING", "ACCEPTED"].includes(r.status)) || null)).catch(() => {});
    }
  }, [id, user]);

  async function sendRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setRequest(await mentoringApi.createRequest(id, message));
      setMsg({ ok: "Đã gửi yêu cầu. Bạn sẽ nhận thông báo khi mentor phản hồi." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (mentor === undefined) return <Loading />;
  if (!mentor) return <Alert>Không tìm thấy mentor. <Link href="/mentors">Xem danh sách mentor</Link></Alert>;

  return (
    <>
      <PageHead title={mentor.displayName} subtitle={`${mentor.domain} · ${mentor.yearsExperience} năm kinh nghiệm · ${formatRate(mentor.hourlyRate)}`}>
        <StatusBadge status={mentor.verificationStatus} />
        <span className={`badge ${mentor.status === "ACCEPTING" ? "good" : mentor.status === "SUSPENDED" ? "bad" : ""}`}>{mentorStatusText(mentor.status, mentor.onLeaveUntil)}</span>
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card">
            <h2>Giới thiệu</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{mentor.bio}</p>
            <div className="chips">{mentor.skills.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
            <p className="small muted" style={{ marginTop: "0.75rem" }}>
              Ngôn ngữ: {mentor.languages.map((l) => LANGUAGE_LABELS[l]).join(", ")} · Nhận: {mentor.sessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(", ")}
              <br />Đặt trước tối thiểu {mentor.minNoticeHours} giờ · Múi giờ {mentor.timezone}
            </p>
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
            {mentor.exceptions.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>Ngày nghỉ / bận sắp tới</h3>
                {mentor.exceptions.map((x) => (
                  <div key={x.id} className="row between small list-item">
                    <span>{formatLocalDate(x.date)}</span>
                    <span>{exceptionTimeLabel(x)}</span>
                  </div>
                ))}
              </>
            )}
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
              <div>
                <h2>Đặt lịch phiên mentoring</h2>
                <p className="muted small">Chọn thời lượng, loại phiên, khung giờ và nội dung muốn trao đổi.</p>
                <Link className="btn" href={`/mentoring/book/${id}`}>Đặt lịch</Link>
              </div>
            )}
            <p className="small row" style={{ marginTop: "1rem" }}>
              <Link href="/mentors">← Danh sách mentor</Link>
              <Link href="/matching">Gợi ý từ AI Matching</Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default function MentorDetailPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{(user) => <MentorDetail user={user} id={params.id} />}</RequireAuth>;
}
