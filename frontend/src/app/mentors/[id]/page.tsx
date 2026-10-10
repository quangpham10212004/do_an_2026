"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { CalendarPlus, Clock, Globe, Send } from "lucide-react";
import { Alert, Avatar, Badge, ButtonLink, Card, CardBody, CardHeader, Chip, Chips, DescriptionList, Loading, StatusBadge } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
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
  if (!mentor) return <Alert action={<ButtonLink href="/mentors" size="sm">Danh sách mentor</ButtonLink>}>Không tìm thấy mentor này.</Alert>;
  // US-27 — mentor bị admin đình chỉ: người xem khác chỉ thấy "Tạm ngưng", không có nút gửi yêu cầu / đặt lịch.
  const suspended = mentor.status === "SUSPENDED";
  const statusText = user.role === "ADMIN" || user.userId === mentor.userId
    ? mentorStatusText(mentor.status, mentor.onLeaveUntil)
    : publicMentorStatusText(mentor.status, mentor.onLeaveUntil);
  const response = mentor.medianResponseHours == null ? null
    : mentor.medianResponseHours <= 24 ? "Thường phản hồi trong 24 giờ" : mentor.medianResponseHours <= 72 ? "Thường phản hồi trong 3 ngày" : "Phản hồi chậm";

  return (
    <>
      <Link href="/mentors" className="page-header-back">← Danh sách mentor</Link>
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-start gap-5">
          <Avatar name={mentor.displayName} src={mentor.avatarUrl} size="xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-title-1 font-semibold">{mentor.displayName}</h1>
            {mentor.headline && <p className="text-body-lg text-ink-muted">{mentor.headline}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
              <span>{domainLabel(mentor.domain)}</span>
              <span>{mentor.yearsExperience} năm kinh nghiệm</span>
              <span className="font-medium text-ink tabular">{formatRate(mentor.hourlyRate)}</span>
              {response && <span className="inline-flex items-center gap-1"><Clock aria-hidden="true" className="size-4" />{response}</span>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <StatusBadge status={mentor.verificationStatus} />
              <Badge tone={mentor.status === "ACCEPTING" ? "success" : suspended ? "danger" : "neutral"}>{statusText}</Badge>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Giới thiệu" />
            <CardBody className="flex flex-col gap-4">
              <p className="prose whitespace-pre-wrap">{mentor.bio}</p>
              <Chips>{mentor.skills.map((s) => <Chip key={s}>{s}</Chip>)}</Chips>
              <DescriptionList items={[
                ["Ngôn ngữ", mentor.languages.map((l) => LANGUAGE_LABELS[l]).join(", ")],
                ["Loại phiên", mentor.sessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(", ")],
                ["Đặt trước tối thiểu", `${mentor.minNoticeHours} giờ`],
                ["Múi giờ", mentor.timezone],
              ]} />
              {mentor.portfolioLinks.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {mentor.portfolioLinks.map((l) => (
                    <li key={l} className="flex items-center gap-2 min-w-0">
                      <Globe aria-hidden="true" className="size-4 flex-none text-ink-subtle" />
                      <a href={l} target="_blank" rel="noreferrer" className="truncate">{l}</a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <MentorReviews mentorId={mentor.userId} />
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20">
          {user.role === "MENTEE" && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                {suspended && <Alert tone="warning">Mentor này đang tạm ngưng hoạt động, chưa thể gửi yêu cầu hoặc đặt lịch mới.</Alert>}
                {!suspended && !request && (
                  <>
                    <div className="text-title-3 font-semibold">Gửi yêu cầu mentoring</div>
                    <p className="text-small text-ink-muted">Mentor cần chấp nhận yêu cầu trước khi bạn đặt lịch. Còn {Math.max(0, mentor.capacity - mentor.activeMenteeCount)} chỗ.</p>
                    <ButtonLink href={`/mentoring/request/${id}`} variant="primary" icon={Send} block>Gửi yêu cầu</ButtonLink>
                  </>
                )}
                {request?.status === "PENDING" && <Alert tone="info">Yêu cầu của bạn đang chờ mentor phản hồi.</Alert>}
                {!suspended && request?.status === "ACCEPTED" && (
                  <>
                    <div className="text-title-3 font-semibold">Đặt lịch phiên mentoring</div>
                    <p className="text-small text-ink-muted">Chọn thời lượng, loại phiên, khung giờ và nội dung muốn trao đổi.</p>
                    <ButtonLink href={`/mentoring/book/${id}`} variant="primary" icon={CalendarPlus} block>Đặt lịch</ButtonLink>
                    <ButtonLink href={`/mentoring/relationships/${request.id}`} block>Không gian mentoring</ButtonLink>
                  </>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Khung giờ trống gần nhất" description="Phiên 60 phút, 14 ngày tới" />
            <CardBody>
              {nextSlots === null ? <p className="text-small text-ink-muted">Đang tải…</p>
                : nextSlots.length === 0 ? <p className="text-small text-ink-muted">Chưa có khung giờ trống trong 14 ngày tới.</p>
                : (
                  <Chips>
                    {nextSlots.map((sl) => <Chip key={sl.startAt}><span className="tabular">{formatDateTime(sl.startAt)}</span></Chip>)}
                  </Chips>
                )}
              {nextSlots && nextSlots.length > 0 && user.role === "MENTEE" && request?.status === "ACCEPTED" && (
                <p className="mt-3 text-small"><Link href={`/mentoring/book/${id}`}>Đặt một khung giờ</Link></p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Lịch rảnh hằng tuần" />
            <CardBody className="flex flex-col gap-1">
              {mentor.availability.length === 0 && <p className="text-ink-muted">Mentor chưa khai báo lịch rảnh.</p>}
              {mentor.availability.map((s) => (
                <div key={s.id} className="flex justify-between gap-3 py-1">
                  <span>{DAY_NAMES[s.dayOfWeek]}</span>
                  <span className="font-mono text-small tabular">{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}</span>
                </div>
              ))}
              {mentor.exceptions.length > 0 && (
                <>
                  <div className="eyebrow mt-3 mb-1">Ngày nghỉ sắp tới</div>
                  {mentor.exceptions.map((x) => (
                    <div key={x.id} className="flex justify-between gap-3 py-1 text-small">
                      <span className="tabular">{formatLocalDate(x.date)}</span>
                      <span className="text-ink-muted">{exceptionTimeLabel(x)}</span>
                    </div>
                  ))}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function MentorDetailPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{(user) => <MentorDetail user={user} id={params.id} />}</RequireAuth>;
}
