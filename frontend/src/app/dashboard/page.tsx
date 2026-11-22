"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, CalendarDays, CheckCircle2, Circle, Inbox, ListChecks, Sparkles, type LucideIcon } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import WelcomeAlerts from "@/components/WelcomeAlerts";
import { Avatar, ButtonLink, Card, CardBody, CardHeader, List, ListRow, PageHeader, Progress, Stat, Stats, StatusBadge } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { aiApi } from "@/features/ai/api";
import { verifyApi } from "@/features/verification/api";
import { mentoringApi } from "@/features/mentoring/api";
import MenteeProgress from "@/features/progress/MenteeProgress";
import { formatDateTime } from "@/lib/format";
import { SESSION_STATUS_LABELS, mentoringTone } from "@/features/mentoring/labels";
import type { CvUploadResult, MenteeProfile, MentorProfile, MentoringRequest, MentoringSession, SessionUser } from "@/types";

interface StepProps {
  done: boolean;
  title: string;
  desc: ReactNode;
  href?: string;
  action?: string;
}

function Step({ done, title, desc, href, action }: StepProps) {
  return (
    <ListRow
      leading={done
        ? <CheckCircle2 aria-label="Đã xong" className="size-5 flex-none text-success" />
        : <Circle aria-label="Chưa xong" className="size-5 flex-none text-ink-subtle" />}
      title={<span className={done ? "text-ink-muted" : ""}>{title}</span>}
      meta={desc}
      trailing={href && <ButtonLink href={href} size="sm" variant={done ? "ghost" : "secondary"}>{action}</ButtonLink>}
    />
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<MentorProfile | MenteeProfile | null | undefined>(undefined);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [enrichment, setEnrichment] = useState<CvUploadResult | null | undefined>(undefined);
  const [sessions, setSessions] = useState<MentoringSession[]>([]);
  const [requests, setRequests] = useState<MentoringRequest[]>([]);
  const isMentor = user.role === "MENTOR";
  const mentorProfile = profile && "verificationStatus" in profile ? profile : null;

  useEffect(() => {
    const loadProfile: Promise<MentorProfile | MenteeProfile> = isMentor ? profileApi.getMentor(user.userId) : profileApi.getMentee(user.userId);
    loadProfile.then(setProfile).catch(() => setProfile(null));
    if (isMentor) verifyApi.overview().then((o) => setInterviewOpen(o.tracks.some((t) => t.stage === "IN_PROGRESS"))).catch(() => setInterviewOpen(false));
    else aiApi.latestEnrichment(user.userId).then(setEnrichment).catch(() => setEnrichment(null));
    mentoringApi.sessions().then(setSessions).catch(() => {});
    mentoringApi.requests().then(setRequests).catch(() => {});
  }, [user, isMentor]);

  const upcoming = sessions
    .filter((s) => ["PENDING", "CONFIRMED"].includes(s.status) && new Date(s.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  const missing = profile?.completeness?.items.filter((i) => !i.done) ?? [];
  const steps: StepProps[] = isMentor
    ? [
        {
          done: !!profile && missing.length === 0,
          title: "Hoàn thành hồ sơ mentor",
          desc: profile ? (missing.length ? `Hoàn thiện ${profile.completeness?.score}% · còn thiếu ${missing.map((i) => i.label).join(", ")}` : "Đã đầy đủ") : "Chuyên môn, kinh nghiệm, mức phí, sức chứa",
          href: "/profile", action: profile ? "Bổ sung" : "Tạo hồ sơ",
        },
        { done: !!mentorProfile?.availability.length, title: "Khai báo lịch rảnh", desc: "Mentee chỉ đặt được lịch trong khung giờ này", href: "/profile#availability", action: "Cập nhật" },
        {
          done: mentorProfile?.verificationStatus === "APPROVED",
          title: "Vượt qua phỏng vấn xác thực",
          desc: mentorProfile ? <span className="inline-flex items-center gap-2">Trạng thái <StatusBadge status={mentorProfile.verificationStatus} /></span> : "Cần có hồ sơ trước",
          href: "/interview",
          action: interviewOpen ? "Tiếp tục" : "Xem",
        },
      ]
    : [
        {
          // Đủ để mở AI Matching (≥ 50%) là xong bước này; các mục còn lại chỉ giúp gợi ý chính xác hơn.
          done: !!profile && "matchingEnabled" in profile && profile.matchingEnabled,
          title: "Tạo hồ sơ học tập",
          desc: profile ? `Hoàn thiện ${profile.completeness?.score}%${missing.length ? ` · có thể bổ sung: ${missing.map((i) => i.label).join(", ")}` : ""}` : "Lĩnh vực, trình độ, kỹ năng và mục tiêu",
          href: profile ? "/profile" : "/onboarding", action: profile ? "Bổ sung" : "Bắt đầu",
        },
        { done: enrichment?.conversation?.status === "COMPLETED", title: "Tải CV và làm rõ mục tiêu", desc: "Chatbot hỏi thêm dựa trên CV — gợi ý mentor sẽ chính xác hơn", href: "/cv-enrichment", action: "Bắt đầu" },
        { done: requests.length > 0, title: "Gửi yêu cầu tới một mentor", desc: "Chọn trong các mentor AI gợi ý cho bạn", href: "/matching", action: "Xem gợi ý" },
      ];
  const remaining = steps.filter((st) => !st.done).length;
  const next = nextStep();
  const hasActivity = upcoming.length > 0 || requests.length > 0;

  /** Một việc quan trọng nhất lúc này — thay cho nhiều nút "Tìm mentor" rải rác. */
  function nextStep(): { icon: LucideIcon; title: string; desc: string; href: string; action: string } | null {
    if (profile === undefined) return null; // đang tải
    const soon = upcoming[0];
    if (soon) {
      const other = isMentor ? soon.menteeName : soon.mentorName;
      return { icon: CalendarDays, title: `Phiên tiếp theo với ${other}`, desc: `${formatDateTime(soon.scheduledAt)} · ${soon.durationMinutes} phút`, href: "/mentoring/sessions", action: "Xem phiên" };
    }
    if (isMentor) {
      if (pendingRequests.length) return { icon: Inbox, title: `${pendingRequests.length} yêu cầu đang chờ bạn`, desc: "Mentee cần phản hồi trong 48 giờ, quá hạn yêu cầu sẽ tự đóng.", href: "/mentoring/requests", action: "Phản hồi ngay" };
      const todo = steps.find((st) => !st.done);
      if (todo?.href) return { icon: ListChecks, title: todo.title, desc: "Hoàn tất để mentee tìm thấy và đặt lịch với bạn.", href: todo.href, action: todo.action || "Tiếp tục" };
      return { icon: CalendarDays, title: "Chưa có phiên nào sắp tới", desc: "Mở thêm khung giờ rảnh để mentee dễ đặt lịch hơn.", href: "/profile#availability", action: "Cập nhật lịch rảnh" };
    }
    if (!profile) return { icon: Sparkles, title: "Cho chúng tôi biết bạn muốn học gì", desc: "3 câu hỏi ngắn, sau đó AI gợi ý ngay những mentor hợp với bạn.", href: "/onboarding", action: "Bắt đầu" };
    if (!requests.length) return { icon: Sparkles, title: "Mentor AI gợi ý cho bạn đã sẵn sàng", desc: "Xem 3 mentor phù hợp nhất và gửi yêu cầu tới người bạn thích.", href: "/matching", action: "Xem gợi ý" };
    if (pendingRequests.length) return { icon: Inbox, title: "Đang chờ mentor phản hồi", desc: `${pendingRequests.length} yêu cầu đang chờ. Mentor thường trả lời trong 48 giờ.`, href: "/mentoring/requests", action: "Xem yêu cầu" };
    return { icon: CalendarDays, title: "Đặt lịch phiên học tiếp theo", desc: "Chọn khung giờ rảnh của mentor để tiếp tục lộ trình.", href: "/mentoring/relationships", action: "Đặt lịch" };
  }

  return (
    <>
      <WelcomeAlerts welcome="Chào mừng bạn đến với MentorHub." />
      <PageHeader
        title={`Chào ${profile?.displayName || user.fullName || user.email}`}
        description={isMentor ? "Lịch dạy, yêu cầu mới và việc cần làm của bạn." : "Lịch học, mentor và tiến độ học tập của bạn."}
      />

      <div className="flex flex-col gap-6">
        {next && (
          <section className="next-step" aria-label="Việc nên làm tiếp theo">
            <span className="next-step-icon"><next.icon aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2>{next.title}</h2>
              <p>{next.desc}</p>
            </div>
            <ButtonLink href={next.href} variant="primary" size="lg">{next.action}</ButtonLink>
          </section>
        )}

        {hasActivity && (
          <Stats>
            <Stat label="Phiên sắp tới" value={upcoming.length} hint={upcoming[0] ? `Gần nhất ${formatDateTime(upcoming[0].scheduledAt)}` : "Chưa có lịch"} />
            <Stat label={isMentor ? "Yêu cầu chờ phản hồi" : "Yêu cầu đã gửi"} value={isMentor ? pendingRequests.length : requests.length}
              hint={isMentor ? "Phản hồi trong 48 giờ" : `${pendingRequests.length} đang chờ mentor`} />
          </Stats>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {!isMentor && profile !== undefined && <MenteeProgress sessions={sessions} name={user.fullName} goal={profile && "goal" in profile ? profile.goal : null} />}
            {upcoming.length > 1 && (
              <Card>
                <CardHeader title="Phiên sắp tới" actions={<Link href="/mentoring/sessions" className="text-small">Xem tất cả</Link>} />
                <List>
                  {upcoming.slice(0, 5).map((s) => {
                    const other = isMentor ? s.menteeName : s.mentorName;
                    return (
                      <ListRow
                        key={s.id}
                        href="/mentoring/sessions"
                        leading={<Avatar name={other} />}
                        title={other}
                        meta={`${formatDateTime(s.scheduledAt)} · ${s.durationMinutes} phút`}
                        trailing={<StatusBadge status={s.status} labels={SESSION_STATUS_LABELS} tone={mentoringTone} />}
                      />
                    );
                  })}
                </List>
              </Card>
            )}
            {remaining > 0 && (
              <Card>
                <CardHeader title="Các bước bắt đầu" description={`Đã xong ${steps.length - remaining}/${steps.length} bước`} />
                <div className="px-5 pt-4"><Progress value={((steps.length - remaining) / steps.length) * 100} label="Tiến độ bắt đầu" /></div>
                <List>
                  {steps.map((st) => <Step key={st.title} {...st} />)}
                </List>
              </Card>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            {!isMentor && (
              <p className="text-small text-ink-muted">
                Muốn tự chọn mentor? <Link href="/mentors">Xem tất cả mentor</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Dashboard user={user} />}</RequireAuth>;
}
