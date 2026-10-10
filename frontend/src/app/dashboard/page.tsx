"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, CheckCircle2, Circle } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, ButtonLink, Card, CardHeader, EmptyState, List, ListRow, PageHeader, Progress, Stat, Stats, StatusBadge } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { CompletenessCard } from "@/features/profile/ProfileExtras";
import { aiApi } from "@/features/ai/api";
import { mentoringApi } from "@/features/mentoring/api";
import { learningApi } from "@/features/learning/api";
import { formatDateTime } from "@/lib/format";
import { SESSION_STATUS_LABELS, mentoringTone } from "@/features/mentoring/labels";
import type { CourseSummary, CvUploadResult, Interview, MenteeProfile, MentorProfile, MentoringRequest, MentoringSession, SessionUser } from "@/types";

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

function Welcome() {
  const params = useSearchParams();
  const verify = params.get("verify");
  return (
    <>
      {params.get("welcome") && <Alert tone="success">Chào mừng bạn đến với MentorHub. Làm theo các bước bên dưới để bắt đầu.</Alert>}
      {params.get("referral") === "invalid" && <Alert tone="warning">Mã giới thiệu không hợp lệ nên chưa được ghi nhận.</Alert>}
      {verify && (
        <Alert tone="info">
          Email xác thực đã được gửi (môi trường demo ghi vào log).{" "}
          <Link href={`/verify-email?token=${verify}`}>Xác thực ngay</Link>.
        </Alert>
      )}
    </>
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<MentorProfile | MenteeProfile | null | undefined>(undefined);
  const [interview, setInterview] = useState<Interview | null | undefined>(undefined);
  const [enrichment, setEnrichment] = useState<CvUploadResult | null | undefined>(undefined);
  const [sessions, setSessions] = useState<MentoringSession[]>([]);
  const [requests, setRequests] = useState<MentoringRequest[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const isMentor = user.role === "MENTOR";
  const mentorProfile = profile && "verificationStatus" in profile ? profile : null;

  useEffect(() => {
    const loadProfile: Promise<MentorProfile | MenteeProfile> = isMentor ? profileApi.getMentor(user.userId) : profileApi.getMentee(user.userId);
    loadProfile.then(setProfile).catch(() => setProfile(null));
    if (isMentor) aiApi.myInterview().then(setInterview).catch(() => setInterview(null));
    else aiApi.latestEnrichment(user.userId).then(setEnrichment).catch(() => setEnrichment(null));
    mentoringApi.sessions().then(setSessions).catch(() => {});
    mentoringApi.requests().then(setRequests).catch(() => {});
    learningApi.myCourses().then(setCourses).catch(() => {});
  }, [user, isMentor]);

  const upcoming = sessions
    .filter((s) => ["PENDING", "CONFIRMED"].includes(s.status) && new Date(s.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  const steps: StepProps[] = isMentor
    ? [
        { done: !!profile, title: "Hoàn thành hồ sơ mentor", desc: "Chuyên môn, kinh nghiệm, mức phí, sức chứa", href: "/profile", action: profile ? "Sửa" : "Tạo hồ sơ" },
        { done: !!mentorProfile?.availability.length, title: "Khai báo lịch rảnh", desc: "Mentee chỉ đặt được lịch trong khung giờ này", href: "/profile#availability", action: "Cập nhật" },
        {
          done: mentorProfile?.verificationStatus === "APPROVED",
          title: "Vượt qua AI Interview",
          desc: mentorProfile ? <span className="inline-flex items-center gap-2">Trạng thái <StatusBadge status={mentorProfile.verificationStatus} /></span> : "Cần có hồ sơ trước",
          href: "/interview",
          action: interview?.status === "IN_PROGRESS" ? "Tiếp tục" : "Xem",
        },
      ]
    : [
        { done: !!profile, title: "Tạo hồ sơ nghề nghiệp", desc: "Lĩnh vực, trình độ, kỹ năng và mục tiêu", href: "/profile", action: profile ? "Sửa" : "Tạo hồ sơ" },
        { done: enrichment?.conversation?.status === "COMPLETED", title: "Tải CV và làm rõ mục tiêu", desc: "Chatbot hỏi thêm dựa trên CV của bạn", href: "/cv-enrichment", action: "Bắt đầu" },
        { done: requests.length > 0, title: "Tìm mentor phù hợp", desc: "AI gợi ý mentor dựa trên hồ sơ của bạn", href: "/matching", action: "Tìm mentor" },
      ];
  const remaining = steps.filter((st) => !st.done).length;

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 empty:hidden">
        <Suspense>
          <Welcome />
        </Suspense>
      </div>
      <PageHeader
        title={`Chào ${profile?.displayName || user.fullName || user.email}`}
        description={isMentor ? "Lịch dạy, yêu cầu mới và việc cần làm của bạn." : "Lịch học, mentor và tiến độ học tập của bạn."}
        actions={isMentor
          ? <ButtonLink href="/mentoring/requests" variant="primary">Xem yêu cầu</ButtonLink>
          : <ButtonLink href="/matching" variant="primary">Tìm mentor</ButtonLink>}
      />

      <div className="mb-6">
        <Stats>
          <Stat label="Phiên sắp tới" value={upcoming.length} hint={upcoming[0] ? `Gần nhất ${formatDateTime(upcoming[0].scheduledAt)}` : "Chưa có lịch"} />
          <Stat label={isMentor ? "Yêu cầu chờ phản hồi" : "Yêu cầu đã gửi"} value={isMentor ? pendingRequests.length : requests.length}
            hint={isMentor ? "Phản hồi trong 48 giờ" : `${pendingRequests.length} đang chờ mentor`} />
          <Stat label="Khoá học" value={courses.length} hint={courses.length ? `${courses.filter((c) => c.percentComplete >= 100).length} đã hoàn thành` : "Chưa đăng ký"} />
        </Stats>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {isMentor && pendingRequests.length > 0 && (
            <Alert tone="info" action={<ButtonLink href="/mentoring/requests" size="sm">Xem ngay</ButtonLink>}>
              Bạn có {pendingRequests.length} yêu cầu mentoring đang chờ phản hồi.
            </Alert>
          )}
          <Card>
            <CardHeader title="Phiên sắp tới" actions={<Link href="/mentoring/sessions" className="text-small">Xem tất cả</Link>} />
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Chưa có phiên nào sắp diễn ra"
                action={!isMentor && <ButtonLink href="/matching" size="sm">Tìm mentor để đặt lịch</ButtonLink>}>
                {isMentor ? "Phiên mentee đặt với bạn sẽ hiện ở đây." : "Đặt lịch với mentor để bắt đầu học."}
              </EmptyState>
            ) : (
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
            )}
          </Card>
          <Card>
            <CardHeader title="Khoá học của tôi" actions={<Link href="/learning" className="text-small">Learning Hub</Link>} />
            {courses.length === 0 ? (
              <EmptyState icon={BookOpen} title="Chưa đăng ký khoá học nào" action={<ButtonLink href="/learning" size="sm">Xem khoá học</ButtonLink>}>
                Khoá học và roadmap trên Learning Hub giúp bạn học giữa các phiên.
              </EmptyState>
            ) : (
              <List>
                {courses.slice(0, 4).map((c) => (
                  <ListRow key={c.id} href={`/learning/courses/${c.id}`} title={c.title}
                    trailing={<span className="text-small text-ink-muted tabular">{c.percentComplete}%</span>}>
                    <div className="mt-2 max-w-[360px]"><Progress value={c.percentComplete} label={`Tiến độ ${c.title}`} /></div>
                  </ListRow>
                ))}
              </List>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Các bước bắt đầu" description={remaining ? `Còn ${remaining} bước` : "Bạn đã hoàn thành tất cả các bước."} />
            <List>
              {steps.map((st) => <Step key={st.title} {...st} />)}
            </List>
            {!isMentor && (
              <div className="card-foot justify-start text-small text-ink-muted">
                <span>Muốn tự chọn? <Link href="/mentors">Duyệt danh sách mentor</Link>.</span>
              </div>
            )}
          </Card>
          {profile?.completeness && profile.completeness.score < 100 && (
            <CompletenessCard completeness={profile.completeness} matchingMin={isMentor ? undefined : 50} />
          )}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Dashboard user={user} />}</RequireAuth>;
}
