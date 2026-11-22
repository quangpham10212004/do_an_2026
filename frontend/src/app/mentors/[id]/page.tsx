"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BlogAuthor } from "@/types";
import RequireAuth from "@/components/RequireAuth";
import { ArrowRight, BadgeCheck, CalendarDays, CalendarPlus, Clock, Compass, Globe, Send, Sparkles, UserRound } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, Chip, Chips, DescriptionList, Loading, Stars, StatusBadge } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
import ScoreBreakdown from "@/features/matching/ScoreBreakdown";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, exceptionTimeLabel, formatLocalDate, mentorStatusText, profileApi, publicMentorStatusText } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import { DAY_NAMES, formatDateTime, formatRate } from "@/lib/format";
import { FollowButton, ProfileHero, ProfilePosts, Section } from "@/features/profile/ProfileParts";
import MentorReviews from "@/features/mentoring/MentorReviews";
import ReviewActions from "@/features/profilex/ReviewActions";
import { usePublicMentorDomains } from "@/features/domains/usePublicDomains";
import { AiMatchingCard, ClassmatesProof, ReferFriendButton, RelatedMentors, ServicesSection, SessionInfoCard } from "@/features/profilex/MentorExtras";
import RefBanner from "./RefBanner";
import type { MatchIntentValue, MentorProfile, MentorReviewSummary, MentoringRequest, PipelineWeights, SessionUser, TimeSlot } from "@/types";

/** Kết quả matching lưu khi mentee bấm vào hồ sơ từ danh sách gợi ý (matching/page.tsx). */
interface MatchContext {
  finalScore: number;
  newMentor: boolean;
  transitionFit: boolean;
  reasons: string[];
  scoreParts: Partial<Record<keyof PipelineWeights, number>>;
  intent?: MatchIntentValue;
}

function readMatchContext(id: string): MatchContext | null {
  try {
    const raw = sessionStorage.getItem(`match:${id}`);
    return raw ? (JSON.parse(raw) as MatchContext) : null;
  } catch {
    return null;
  }
}

function MentorDetail({ user, id }: { user: SessionUser; id: string }) {
  const [mentor, setMentor] = useState<MentorProfile | null | undefined>(undefined);
  const [request, setRequest] = useState<MentoringRequest | null>(null);
  // US-44 (PRD-MATCH-9) — 3 khung giờ rảnh gần nhất (phiên 60 phút, 14 ngày tới)
  const [nextSlots, setNextSlots] = useState<TimeSlot[] | null>(null);
  const [summary, setSummary] = useState<MentorReviewSummary | null>(null);
  const [match, setMatch] = useState<MatchContext | null>(null);
  const [author, setAuthor] = useState<BlogAuthor | null>(null);
  const [active, setActive] = useState("tong-quan");
  // Lĩnh vực đã xác thực (công khai): GET /api/profile/mentor/{id}/domains/public
  const verified = usePublicMentorDomains(id, mentor?.domain, !!mentor && user.userId === mentor.userId);

  useEffect(() => {
    profileApi.getMentor(id).then(setMentor).catch(() => setMentor(null));
    mentoringApi.availableSlots(id, 60, 14).then((r) => setNextSlots(r.slots.slice(0, 3))).catch(() => setNextSlots([]));
    if (user.role === "MENTEE") {
      setMatch(readMatchContext(id));
      mentoringApi.requests().then((rs) => setRequest(rs.find((r) => r.mentorId === id && ["PENDING", "ACCEPTED"].includes(r.status)) || null)).catch(() => {});
    }
  }, [id, user]);

  useEffect(() => {
    if (!mentor) return;
    const ids = ["tong-quan", "gioi-thieu", "dich-vu", "bai-viet", "lich", "reviews", "hanh-trinh"];
    const obs = new IntersectionObserver((es) => {
      const hit = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    ids.forEach((i) => { const el = document.getElementById(i); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [mentor]);

  if (mentor === undefined) return <Loading />;
  if (!mentor) return <Alert action={<ButtonLink href="/mentors" size="sm">Danh sách mentor</ButtonLink>}>Không tìm thấy mentor này.</Alert>;
  // US-27 — mentor bị admin đình chỉ: người xem khác chỉ thấy "Tạm ngưng", không có nút gửi yêu cầu / đặt lịch.
  const suspended = mentor.status === "SUSPENDED";
  const statusText = user.role === "ADMIN" || user.userId === mentor.userId
    ? mentorStatusText(mentor.status, mentor.onLeaveUntil)
    : publicMentorStatusText(mentor.status, mentor.onLeaveUntil);
  const domainList = verified && verified.length > 0 ? verified.map((d) => d.domain) : [mentor.domain];
  const multiDomain = domainList.length > 1;
  const response = mentor.medianResponseHours == null ? null
    : mentor.medianResponseHours <= 24 ? "Thường phản hồi trong 24 giờ" : mentor.medianResponseHours <= 72 ? "Thường phản hồi trong 3 ngày" : "Phản hồi chậm";

  return (
    <>
      <Link href="/mentors" className="page-header-back">← Danh sách mentor</Link>
      {user.userId !== mentor.userId && <RefBanner />}
      <ProfileHero
        name={mentor.displayName} avatarUrl={mentor.avatarUrl}
        badges={<><StatusBadge status={mentor.verificationStatus} />{domainList.map((d) => <Badge key={d} tone={d === mentor.domain ? "accent" : "success"} title={`Đã xác thực lĩnh vực ${domainLabel(d)}`}>{domainLabel(d)}</Badge>)}{mentor.previousDomains?.length > 0 && <Badge tone="success">Từng chuyển ngách</Badge>}<Badge tone={mentor.status === "ACCEPTING" ? "success" : suspended ? "danger" : "neutral"}>{statusText}</Badge></>}
        headline={mentor.headline}
        meta={<>
          {domainList.map(domainLabel).join(" · ")} · {mentor.yearsExperience} năm kinh nghiệm · {formatRate(mentor.hourlyRate)}
          {response && <> · {response}</>}
          {author && <> · {author.followerCount} người theo dõi</>}
          {summary && <> · {summary.sessionsCompleted} phiên đã hoàn thành</>}
        </>}
        social={user.userId !== mentor.userId ? <ClassmatesProof mentorId={mentor.userId} /> : undefined}
        actions={<>
          {user.role === "MENTEE" && !suspended && !request && <ButtonLink href={`/mentoring/request/${id}`} variant="primary" icon={Send}>Gửi yêu cầu</ButtonLink>}
          {user.role === "MENTEE" && !suspended && request?.status === "ACCEPTED" && <ButtonLink href={`/mentoring/book/${id}`} variant="primary" icon={CalendarPlus}>Đặt lịch</ButtonLink>}
          {user.userId === mentor.userId && <ButtonLink href="/profile" variant="primary">Chỉnh sửa hồ sơ</ButtonLink>}
          <FollowButton userId={mentor.userId} self={user.userId === mentor.userId} onChange={setAuthor} />
          {user.role === "MENTEE" && !suspended && <ReferFriendButton mentorId={mentor.userId} />}
        </>}
        tabs={[
          { id: "tong-quan", label: "Tổng quan" }, { id: "gioi-thieu", label: "Giới thiệu" }, { id: "dich-vu", label: "Dịch vụ" },
          { id: "bai-viet", label: "Bài viết", count: author?.postCount }, { id: "lich", label: "Lịch rảnh" },
          { id: "reviews", label: "Đánh giá", count: summary?.reviewCount },
          ...(mentor.previousDomains?.length > 0 || multiDomain ? [{ id: "hanh-trinh", label: "Hành trình" }] : []),
        ]}
        active={active}
      />

      <div className="pf-grid">
        <div className="pf-main">
          <div id="tong-quan" />
          {(mentor.previousDomains?.length > 0 || multiDomain) && (
            <Section id="hanh-trinh" icon={Compass} title="Hành trình">
              <div className="flex flex-col gap-3">
                {mentor.previousDomains?.length > 0 && (
                  <>
                    <div className="journey" aria-label="Hành trình các lĩnh vực">
                      {mentor.previousDomains.map((d) => (
                        <span key={d} className="inline-flex items-center gap-2"><Chip>{domainLabel(d)}</Chip><ArrowRight aria-hidden="true" /></span>
                      ))}
                      <Chip selected>{domainLabel(mentor.domain)}</Chip>
                    </div>
                    <p className="text-small text-ink-muted">
                      Hiện làm {domainLabel(mentor.domain)} với {mentor.yearsExperience} năm kinh nghiệm. Phù hợp nếu bạn đang ở
                      {" "}{mentor.previousDomains.map(domainLabel).join(" / ")} và muốn chuyển sang {domainLabel(mentor.domain)}.
                    </p>
                  </>
                )}
                {multiDomain && (
                  <div>
                    <div className="eyebrow mb-2">Lĩnh vực đã xác thực</div>
                    <ul className="flex flex-wrap gap-2" aria-label="Lĩnh vực đã xác thực">
                      {domainList.map((d) => (
                        <li key={d} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-accent-soft px-3.5 text-small font-semibold text-accent-ink">
                          <BadgeCheck aria-hidden="true" className="size-4" />{domainLabel(d)}{d === mentor.domain && <span className="font-normal text-ink-muted"> · chính</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}
          <Section id="gioi-thieu" icon={UserRound} title="Giới thiệu">
            <div className="flex flex-col gap-4">
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
            </div>
          </Section>
          <ServicesSection mentor={mentor} />
          <ProfilePosts userId={mentor.userId} total={author?.postCount} self={user.userId === mentor.userId} />
          <Section id="lich" icon={CalendarDays} title="Lịch rảnh">
            <div className="flex flex-col gap-4">
              <p className="text-small text-ink-muted">Giờ hiển thị theo múi giờ {mentor.timezone} · báo trước tối thiểu {mentor.minNoticeHours} giờ</p>
              <div>
                <div className="eyebrow mb-2">Khung giờ trống gần nhất (phiên 60 phút, 14 ngày tới)</div>
                {nextSlots === null ? <p className="text-small text-ink-muted">Đang tải…</p>
                  : nextSlots.length === 0 ? <p className="text-small text-ink-muted">Chưa có khung giờ trống trong 14 ngày tới.</p>
                  : <div className="flex flex-wrap gap-2">{nextSlots.map((sl) => <span key={sl.startAt} className="pf-slot tabular">{formatDateTime(sl.startAt)}</span>)}</div>}
                {nextSlots && nextSlots.length > 0 && user.role === "MENTEE" && request?.status === "ACCEPTED" && (
                  <p className="mt-3 text-small"><Link href={`/mentoring/book/${id}`}>Đặt một khung giờ</Link></p>
                )}
              </div>
              <div>
                <div className="eyebrow mb-1">Lịch hằng tuần</div>
                {mentor.availability.length === 0 && <p className="text-ink-muted">Mentor chưa khai báo lịch rảnh.</p>}
                {mentor.availability.map((s) => (
                  <div key={s.id} className="flex justify-between gap-3 py-1">
                    <span>{DAY_NAMES[s.dayOfWeek]}</span>
                    <span className="font-mono text-small tabular">{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}</span>
                  </div>
                ))}
              </div>
              {mentor.exceptions.length > 0 && (
                <div>
                  <div className="eyebrow mb-1">Ngày nghỉ sắp tới</div>
                  {mentor.exceptions.map((x) => (
                    <div key={x.id} className="flex justify-between gap-3 py-1 text-small">
                      <span className="tabular">{formatLocalDate(x.date)}</span>
                      <span className="text-ink-muted">{exceptionTimeLabel(x)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
          <MentorReviews mentorId={mentor.userId} onLoaded={setSummary} renderActions={(r) => <ReviewActions review={r} />} />
        </div>

        <div className="pf-side">
          {user.role === "MENTEE" && match && (
            <Card>
              <CardHeader title={`Phù hợp ${Math.round(match.finalScore * 100)}% với bạn`}
                description={match.intent?.mode === "SWITCH" && match.intent.targetDomain
                  ? `Khi bạn muốn chuyển sang ${domainLabel(match.intent.targetDomain)}` : "Theo hồ sơ, mục tiêu và lịch rảnh của bạn"} />
              <CardBody className="flex flex-col gap-3">
                <ScoreBreakdown m={match} />
                <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-ink-muted">
                  {match.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </CardBody>
            </Card>
          )}
          {user.role === "MENTEE" && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                {suspended && <Alert tone="warning">Mentor này đang tạm ngưng hoạt động, chưa thể gửi yêu cầu hoặc đặt lịch mới.</Alert>}
                {!suspended && !request && (
                  <>
                    <div className="text-title-3 font-semibold">Gửi yêu cầu mentoring</div>
                    <p className="text-small text-ink-muted">Mentor cần chấp nhận yêu cầu trước khi bạn đặt lịch. Còn {Math.max(0, mentor.capacity - mentor.activeMenteeCount)} chỗ.</p>
                    <ButtonLink href={`/mentoring/request/${id}`} variant="primary" icon={Send} block>Gửi yêu cầu</ButtonLink>
                    {mentor.trialEnabled && (
                      <>
                        <hr className="divider" />
                        <div className="text-title-3 font-semibold">Chưa chắc chắn? Học thử 15 phút</div>
                        <p className="text-small text-ink-muted">Buổi trải nghiệm 30.000đ, không cần mentor chấp nhận trước, mỗi mentor một lần.</p>
                        <ButtonLink href={`/mentoring/book/${id}?trial=1`} icon={Sparkles} block>Đặt buổi trải nghiệm</ButtonLink>
                      </>
                    )}
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
          {user.role === "MENTEE" && <AiMatchingCard />}
          <SessionInfoCard mentor={mentor} />
          <RelatedMentors mentor={mentor} />
        </div>
      </div>
    </>
  );
}

export default function MentorDetailPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{(user) => <MentorDetail user={user} id={params.id} />}</RequireAuth>;
}
