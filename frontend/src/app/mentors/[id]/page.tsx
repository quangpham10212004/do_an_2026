"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, exceptionTimeLabel, formatLocalDate, mentorStatusText, profileApi, publicMentorStatusText } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import { DAY_NAMES, formatDateTime, formatRate } from "@/lib/format";
import MentorReviews from "@/features/mentoring/MentorReviews";
import type { MentorProfile, MentoringRequest, SessionUser, TimeSlot } from "@/types";

function MentorDetail({ user, id }: { user: SessionUser; id: string }) {
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [request, setRequest] = useState<MentoringRequest | null>(null);
  // US-44 (PRD-MATCH-9) — 3 khung giờ rảnh gần nhất (phiên 60 phút, 14 ngày tới)
  const [nextSlots, setNextSlots] = useState<TimeSlot[] | null>(null);

  useEffect(() => {
    profileApi.getMentor(id).then(setMentor).catch(() => setMentor(null));
    mentoringApi.availableSlots(id, 60, 14).then((r) => setNextSlots(r.slots.slice(0, 3))).catch(() => setNextSlots([]));
    if (user.role === "MENTEE") {
      mentoringApi.requests().then((rs) => setRequest(rs.find((r) => r.mentorId === id && ["PENDING", "ACCEPTED"].includes(r.status)) || null)).catch(() => {});
    }
  }, [id, user]);

  if (mentor === undefined) return <Loading />;
  if (!mentor) return <Alert>Không tìm thấy mentor. <Link href="/mentors">Xem danh sách mentor</Link></Alert>;
  // US-27 — mentor bị admin đình chỉ: người xem khác chỉ thấy "Tạm ngưng", không có nút gửi yêu cầu / đặt lịch.
  const suspended = mentor.status === "SUSPENDED";
  const statusText = user.role === "ADMIN" || user.userId === mentor.userId
    ? mentorStatusText(mentor.status, mentor.onLeaveUntil)
    : publicMentorStatusText(mentor.status, mentor.onLeaveUntil);

  return (
    <>
      <PageHead title={mentor.displayName} subtitle={<>
        {mentor.headline && <>{mentor.headline}<br /></>}
        {`${mentor.domain} · ${mentor.yearsExperience} năm kinh nghiệm · ${formatRate(mentor.hourlyRate)}`}
        {mentor.medianResponseHours !== null && mentor.medianResponseHours !== undefined && (
          <> · {mentor.medianResponseHours <= 24 ? "thường phản hồi trong 24 giờ" : mentor.medianResponseHours <= 72 ? "thường phản hồi trong 3 ngày" : "phản hồi chậm"}</>
        )}
      </>}>
        <StatusBadge status={mentor.verificationStatus} />
        <span className={`badge ${mentor.status === "ACCEPTING" ? "good" : suspended ? "bad" : ""}`}>{statusText}</span>
      </PageHead>
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
            <h2>Khung giờ trống gần nhất</h2>
            {nextSlots === null ? <p className="muted small">Đang tải…</p>
              : nextSlots.length === 0 ? <p className="muted small">Chưa có khung giờ trống trong 14 ngày tới.</p>
              : (
                <div className="chips">
                  {nextSlots.map((sl) => <span key={sl.startAt} className="chip">{formatDateTime(sl.startAt)}</span>)}
                </div>
              )}
            {nextSlots && nextSlots.length > 0 && user.role === "MENTEE" && request?.status === "ACCEPTED" && (
              <p className="small" style={{ marginTop: 6 }}><Link href={`/mentoring/book/${id}`}>Đặt một khung giờ →</Link></p>
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
          <MentorReviews mentorId={mentor.userId} />
        </div>

        {user.role === "MENTEE" && (
          <div className="card">
            {suspended && (
              <Alert type="warn">Mentor này đang tạm ngưng hoạt động — chưa thể gửi yêu cầu hoặc đặt lịch mới.</Alert>
            )}
            {!suspended && !request && (
              <div>
                <h2>Gửi yêu cầu mentoring</h2>
                <p className="muted small">Mentor cần chấp nhận yêu cầu trước khi bạn đặt lịch. Còn {Math.max(0, mentor.capacity - mentor.activeMenteeCount)} chỗ.</p>
                <Link className="btn" href={`/mentoring/request/${id}`}>Gửi yêu cầu</Link>
              </div>
            )}
            {request?.status === "PENDING" && <Alert type="info">Yêu cầu của bạn đang chờ mentor phản hồi.</Alert>}
            {!suspended && request?.status === "ACCEPTED" && (
              <div>
                <h2>Đặt lịch phiên mentoring</h2>
                <p className="muted small">Chọn thời lượng, loại phiên, khung giờ và nội dung muốn trao đổi.</p>
                <div className="row">
                  <Link className="btn" href={`/mentoring/book/${id}`}>Đặt lịch</Link>
                  <Link className="btn secondary" href={`/mentoring/relationships/${request.id}`}>Không gian mentoring</Link>
                </div>
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
