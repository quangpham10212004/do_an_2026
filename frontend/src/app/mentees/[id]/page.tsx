"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Globe, Target, UserRound } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, Badge, ButtonLink, DescriptionList, Loading } from "@/components/ui";
import { domainLabel, profileApi } from "@/features/profile/api";
import { FollowButton, ProfileHero, ProfilePosts, Section } from "@/features/profile/ProfileParts";
import { mentoringApi } from "@/features/mentoring/api";
import { LearnedWithSection, MentorFeedbackSection, PrivacySection, RequestActions, SkillsSplit, WishesSection } from "@/features/profilex/MenteeExtras";
import { profilexApi, type MenteeExtras } from "@/features/profilex/api";
import type { BlogAuthor, MenteeProfile, MentoringRequest, SessionUser } from "@/types";

const LEVEL_LABELS: Record<string, string> = { BEGINNER: "Mới bắt đầu", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" };

function MenteeDetail({ user, id }: { user: SessionUser; id: string }) {
  const [mentee, setMentee] = useState<MenteeProfile | null | undefined>(undefined);
  const [author, setAuthor] = useState<BlogAuthor | null>(null);
  const [extras, setExtras] = useState<MenteeExtras | null>(null);
  // Yêu cầu đang chờ của mentee này gửi cho mentor đang xem
  const [request, setRequest] = useState<MentoringRequest | null>(null);
  const [handled, setHandled] = useState<MentoringRequest | null>(null);
  const [active, setActive] = useState("tong-quan");
  const self = user.userId === id;

  useEffect(() => { profileApi.getMentee(id).then(setMentee).catch(() => setMentee(null)); }, [id]);
  useEffect(() => { profilexApi.menteeExtras(id).then(setExtras).catch(() => setExtras(null)); }, [id]);
  useEffect(() => {
    if (user.role !== "MENTOR") return;
    mentoringApi.requests()
      .then((rs) => setRequest(rs.find((r) => r.menteeId === id && r.status === "PENDING") || null))
      .catch(() => {});
  }, [id, user.role]);

  useEffect(() => {
    if (!mentee) return;
    const ids = ["tong-quan", "muc-tieu", "ky-nang", "bai-viet", "nhan-xet"];
    const obs = new IntersectionObserver((es) => {
      const hit = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    ids.forEach((i) => { const el = document.getElementById(i); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [mentee]);

  if (mentee === undefined) return <Loading />;
  if (!mentee) return <Alert action={<ButtonLink href="/blog" size="sm">Về blog</ButtonLink>}>Không xem được hồ sơ này.</Alert>;

  const level = LEVEL_LABELS[mentee.currentLevel] ?? mentee.currentLevel;
  const joined = extras?.joinedAt ? new Date(extras.joinedAt) : null;
  const joinedText = joined ? `${String(joined.getMonth() + 1).padStart(2, "0")}/${joined.getFullYear()}` : null;

  return (
    <>
      <ProfileHero
        name={mentee.displayName} avatarUrl={mentee.avatarUrl}
        badges={<Badge tone="accent">Mentee</Badge>}
        headline={mentee.goal}
        meta={<>
          {domainLabel(mentee.domain)} · Trình độ {level.toLowerCase()} · {mentee.timezone}
          {joinedText && <> · tham gia {joinedText}</>}
          {extras && <> · {extras.sessionsCompleted} phiên đã học</>}
          {extras?.onTimeRate != null && <> · <b>{extras.onTimeRate}% đúng giờ</b></>}
          {author && <> · {author.followerCount} người theo dõi</>}
        </>}
        social={extras && extras.mentors.length > 0 ? (
          <>
            <span className="pf-avatars" aria-hidden="true">{extras.mentors.slice(0, 3).map((m) => <Avatar key={m.mentorId} name={m.name} size="sm" />)}</span>
            <span>Đã học với {extras.mentors.length} mentor</span>
          </>
        ) : undefined}
        actions={<>
          {request && !handled && <RequestActions request={request} onDone={setHandled} />}
          {handled && (
            <Alert tone={handled.status === "ACCEPTED" ? "success" : "info"} action={handled.status === "ACCEPTED" ? <ButtonLink href={`/mentoring/relationships/${handled.id}`} size="sm">Không gian mentoring</ButtonLink> : undefined}>
              {handled.status === "ACCEPTED" ? "Đã chấp nhận yêu cầu." : "Đã từ chối yêu cầu."}
            </Alert>
          )}
          {self && <ButtonLink href="/profile" variant="primary">Chỉnh sửa hồ sơ</ButtonLink>}
          <FollowButton userId={id} self={self} onChange={setAuthor} />
        </>}
        tabs={[
          { id: "tong-quan", label: "Tổng quan" }, { id: "muc-tieu", label: "Mục tiêu" }, { id: "ky-nang", label: "Kỹ năng" },
          { id: "bai-viet", label: "Bài viết", count: author?.postCount }, { id: "nhan-xet", label: "Nhận xét" },
        ]}
        active={active}
      />
      <div className="pf-grid">
        <div className="pf-main">
          <div id="tong-quan" />
          <Section id="muc-tieu" icon={Target} title="Mục tiêu học tập">
            <div className="flex flex-col gap-4">
              {mentee.goal ? <p className="prose whitespace-pre-wrap">{mentee.goal}</p> : <p className="text-small text-ink-muted">Chưa có mục tiêu.</p>}
              <DescriptionList items={[["Lĩnh vực", domainLabel(mentee.domain)], ["Trình độ", level]]} />
            </div>
          </Section>
          <SkillsSplit have={mentee.skills} want={extras?.wantedSkills ?? []} />
          <ProfilePosts userId={id} total={author?.postCount} self={self} />
          <MentorFeedbackSection extras={extras} />
        </div>
        <div className="pf-side">
          <WishesSection mentee={mentee} extras={extras} />
          <LearnedWithSection extras={extras} />
          {mentee.portfolioLinks.length > 0 && (
            <Section icon={Globe} title="Liên kết">
              <ul className="flex flex-col gap-1">
                {mentee.portfolioLinks.map((l) => <li key={l} className="truncate"><a href={l} target="_blank" rel="noreferrer">{l}</a></li>)}
              </ul>
            </Section>
          )}
          <PrivacySection self={self} />
          {self && (
            <Section icon={UserRound} title="Tìm mentor">
              <p className="text-small text-ink-muted">Muốn học cùng mentor phù hợp? <Link href="/matching">Tìm mentor bằng AI</Link>.</p>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

export default function MenteePage({ params }: { params: { id: string } }) {
  return <RequireAuth>{(user) => <MenteeDetail user={user} id={params.id} />}</RequireAuth>;
}
