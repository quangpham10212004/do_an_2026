"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase, Clock, Gift, Info, Sparkles, Users } from "lucide-react";
import { Avatar, Badge, ButtonLink, DescriptionList } from "@/components/ui";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, domainLabel, profileApi } from "@/features/profile/api";
import { FollowButton, Section } from "@/features/profile/ProfileParts";
import { formatMoney } from "@/lib/format";
import { profilexApi, type ClassmateProof } from "./api";
import type { MentorCard, MentorProfile, SessionType } from "@/types";

const SESSION_DESC: Record<SessionType, string> = {
  CAREER_ADVICE: "Định hướng lộ trình 6–12 tháng.",
  CODE_REVIEW: "Góp ý dự án cá nhân, PR thật.",
  MOCK_INTERVIEW: "Mô phỏng vòng kỹ thuật.",
  PROJECT_GUIDANCE: "Thiết kế và xây từ đầu.",
};
export const TRIAL_PRICE = 30000;

/** Dòng "Hoàng Nam và 2 mentee khác đã học với mentor này" dưới tên (hero). */
export function ClassmatesProof({ mentorId }: { mentorId: string }) {
  const [p, setP] = useState<ClassmateProof | null>(null);
  useEffect(() => { profilexApi.classmates(mentorId).then(setP).catch(() => setP(null)); }, [mentorId]);
  if (!p || p.total === 0) return null;
  const rest = p.total - 1;
  return (
    <>
      <span className="pf-avatars" aria-hidden="true">{p.names.slice(0, 3).map((n) => <Avatar key={n} name={n} size="sm" />)}</span>
      <span>{p.names[0]}{rest > 0 ? ` và ${rest} mentee khác` : ""} đã học với mentor này</span>
    </>
  );
}

/** Tab "Dịch vụ": loại phiên, thời lượng, giá, buổi thử. */
export function ServicesSection({ mentor }: { mentor: MentorProfile }) {
  const rate = mentor.hourlyRate;
  return (
    <Section id="dich-vu" icon={Briefcase} title="Dịch vụ">
      <div className="flex flex-col gap-4">
        <ul className="pf-svc-grid" aria-label="Loại phiên mentor nhận">
          {mentor.sessionTypes.map((t) => (
            <li key={t} className="pf-service">
              <div className="font-semibold">{SESSION_TYPE_LABELS[t]}</div>
              <p className="mt-1 text-small text-ink-muted">{SESSION_DESC[t]}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-small">
                <Badge tone="neutral"><Clock aria-hidden="true" className="mr-1 inline size-3.5" />60 phút</Badge>
                <span className="font-mono tabular">{rate > 0 ? formatMoney(rate) : "Chưa đặt giá"}</span>
              </div>
            </li>
          ))}
          {mentor.sessionTypes.length === 0 && <li className="text-small text-ink-muted">Mentor chưa chọn loại phiên.</li>}
        </ul>
        {mentor.trialEnabled && (
          <div className="pf-service flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Buổi thử 15 phút</div>
              <p className="mt-1 text-small text-ink-muted">Làm quen trước khi gửi yêu cầu, mỗi mentor một lần.</p>
            </div>
            <span className="font-mono tabular">{formatMoney(TRIAL_PRICE)}</span>
          </div>
        )}
        <p className="text-small text-ink-subtle">Đặt trước tối thiểu {mentor.minNoticeHours} giờ.</p>
      </div>
    </Section>
  );
}

export function AiMatchingCard() {
  return (
    <div className="pf-promo">
      <div className="text-title-3 font-semibold">Chưa chắc mentor này hợp?</div>
      <p className="mt-2 text-small opacity-90">AI Matching đọc CV và mục tiêu của bạn rồi gợi ý mentor phù hợp.</p>
      <ButtonLink href="/matching" icon={Sparkles} className="mt-4" block>Thử AI Matching</ButtonLink>
    </div>
  );
}

/** "Mentor khác bạn có thể quan tâm": cùng lĩnh vực, bỏ chính mentor đang xem. */
export function RelatedMentors({ mentor }: { mentor: MentorProfile }) {
  const [list, setList] = useState<MentorCard[] | null>(null);
  useEffect(() => {
    let alive = true;
    profileApi.searchMentors({ domain: mentor.domain, size: 6 })
      .then((p) => { if (alive) setList(p.items.filter((m) => m.userId !== mentor.userId).slice(0, 3)); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [mentor.domain, mentor.userId]);
  if (list && list.length === 0) return null;
  return (
    <Section icon={Users} title="Mentor khác bạn có thể quan tâm">
      {list === null ? <p className="text-small text-ink-muted">Đang tải…</p> : (
        <ul className="flex flex-col gap-4">
          {list.map((m) => (
            <li key={m.userId} className="pf-rel">
              <Avatar name={m.displayName} src={m.avatarUrl} />
              <div className="min-w-0 flex-1">
                <Link href={`/mentors/${m.userId}`} className="font-semibold">{m.displayName}</Link>
                <div className="truncate text-small text-ink-muted">{m.headline || domainLabel(m.domain)}</div>
                <div className="text-small text-ink-subtle tabular">
                  {m.ratingCount > 0 ? `★ ${m.rating.toFixed(1)} · ` : ""}{m.hourlyRate > 0 ? `${formatMoney(m.hourlyRate)} / giờ` : "Chưa đặt giá"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <FollowButton userId={m.userId} self={false} />
                  <Link href={`/mentors/${m.userId}`} className="pf-link-touch">Xem hồ sơ</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Khối "Thông tin buổi học": ngôn ngữ, chỗ trống, buổi thử. */
export function SessionInfoCard({ mentor }: { mentor: MentorProfile }) {
  const free = Math.max(0, mentor.capacity - mentor.activeMenteeCount);
  const items: [string, string][] = [
    ["Ngôn ngữ", mentor.languages.map((l) => LANGUAGE_LABELS[l]).join(", ") || "Chưa khai báo"],
    ["Còn trống", free > 0 ? `${free} chỗ` : "Hết chỗ"],
  ];
  if (mentor.trialEnabled) items.push(["Buổi thử", `15 phút · ${formatMoney(TRIAL_PRICE)}`]);
  return (
    <Section icon={Info} title="Thông tin buổi học">
      <DescriptionList items={items} />
    </Section>
  );
}

/** Nút giới thiệu bạn bè trên hồ sơ mentor. */
export function ReferFriendButton({ mentorId }: { mentorId: string }) {
  return (
    <ButtonLink href={`/referral/share?mentor=${encodeURIComponent(mentorId)}`} icon={Gift}>
      Giới thiệu bạn bè +30.000 đ
    </ButtonLink>
  );
}
