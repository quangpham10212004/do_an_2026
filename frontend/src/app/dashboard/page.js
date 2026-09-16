"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, PageHead, StatusBadge } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import { learningApi } from "@/features/learning/api";
import { formatDateTime } from "@/lib/format";

function Step({ done, title, desc, href, action }) {
  return (
    <div className="list-item">
      <div style={{ fontSize: "1.3rem" }}>{done ? "✅" : "⬜"}</div>
      <div style={{ flex: 1 }}>
        <strong>{title}</strong>
        <div className="muted small">{desc}</div>
      </div>
      {href && <Link href={href} className={`btn sm ${done ? "secondary" : ""}`}>{action}</Link>}
    </div>
  );
}

function Welcome() {
  const params = useSearchParams();
  const verify = params.get("verify");
  return (
    <>
      {params.get("welcome") && <Alert type="success">Chào mừng bạn đến với MentorHub!</Alert>}
      {params.get("referral") === "invalid" && <Alert type="warn">Mã giới thiệu không hợp lệ nên chưa được ghi nhận.</Alert>}
      {verify && (
        <Alert type="info">
          Email xác thực đã được gửi (môi trường demo ghi vào log).{" "}
          <Link href={`/verify-email?token=${verify}`}>Bấm vào đây để xác thực ngay</Link>.
        </Alert>
      )}
    </>
  );
}

function Dashboard({ user }) {
  const [profile, setProfile] = useState(undefined);
  const [interview, setInterview] = useState(undefined);
  const [enrichment, setEnrichment] = useState(undefined);
  const [sessions, setSessions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [courses, setCourses] = useState([]);
  const isMentor = user.role === "MENTOR";

  useEffect(() => {
    (isMentor ? profileApi.getMentor(user.userId) : profileApi.getMentee(user.userId)).then(setProfile).catch(() => setProfile(null));
    if (isMentor) mentoringApi.myInterview().then(setInterview).catch(() => setInterview(null));
    else mentoringApi.latestEnrichment(user.userId).then(setEnrichment).catch(() => setEnrichment(null));
    mentoringApi.sessions().then(setSessions).catch(() => {});
    mentoringApi.requests().then(setRequests).catch(() => {});
    learningApi.myCourses().then(setCourses).catch(() => {});
  }, [user, isMentor]);

  const upcoming = sessions
    .filter((s) => ["PENDING", "CONFIRMED"].includes(s.status) && new Date(s.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <>
      <Suspense>
        <Welcome />
      </Suspense>
      <PageHead title={`Xin chào, ${profile?.displayName || user.fullName || user.email}`} subtitle={isMentor ? "Trang chủ mentor" : "Trang chủ mentee"} />
      <div className="grid grid-2">
        <div className="card">
          <h2>Các bước bắt đầu</h2>
          {isMentor ? (
            <>
              <Step done={!!profile} title="Hoàn thành hồ sơ mentor" desc="Chuyên môn, kinh nghiệm, mức phí, sức chứa" href="/profile" action={profile ? "Sửa" : "Tạo hồ sơ"} />
              <Step done={!!profile?.availability?.length} title="Khai báo lịch rảnh" desc="Mentee chỉ đặt được lịch trong khung giờ này" href="/profile#availability" action="Cập nhật" />
              <Step
                done={profile?.verificationStatus === "APPROVED"}
                title="Vượt qua AI Interview"
                desc={profile ? <>Trạng thái: <StatusBadge status={profile.verificationStatus} /></> : "Cần có hồ sơ trước"}
                href="/interview"
                action={interview?.status === "IN_PROGRESS" ? "Tiếp tục" : "Xem"}
              />
            </>
          ) : (
            <>
              <Step done={!!profile} title="Tạo hồ sơ nghề nghiệp" desc="Lĩnh vực, trình độ, kỹ năng và mục tiêu" href="/profile" action={profile ? "Sửa" : "Tạo hồ sơ"} />
              <Step done={enrichment?.conversation?.status === "COMPLETED"} title="Tải CV & làm rõ mục tiêu" desc="Chatbot hỏi thêm dựa trên CV của bạn" href="/cv-enrichment" action="Bắt đầu" />
              <Step done={requests.length > 0} title="Tìm mentor phù hợp" desc="AI gợi ý mentor dựa trên hồ sơ của bạn" href="/matching" action="Tìm mentor" />
            </>
          )}
        </div>
        <div className="card">
          <div className="row between">
            <h2>Phiên sắp tới</h2>
            <Link href="/mentoring/sessions" className="small">Xem tất cả</Link>
          </div>
          {upcoming.length === 0 && <p className="muted">Chưa có phiên nào sắp diễn ra.</p>}
          {upcoming.slice(0, 4).map((s) => (
            <div className="list-item" key={s.id}>
              <div style={{ flex: 1 }}>
                <strong>{isMentor ? s.menteeName : s.mentorName}</strong>
                <div className="muted small">{formatDateTime(s.scheduledAt)} · {s.durationMinutes} phút</div>
              </div>
              <StatusBadge status={s.status} />
            </div>
          ))}
          {isMentor && pendingRequests.length > 0 && (
            <Alert type="info">
              Bạn có {pendingRequests.length} yêu cầu mentoring đang chờ phản hồi. <Link href="/mentoring/requests">Xem ngay</Link>
            </Alert>
          )}
        </div>
        <div className="card">
          <div className="row between">
            <h2>Khoá học của tôi</h2>
            <Link href="/learning" className="small">Learning Hub</Link>
          </div>
          {courses.length === 0 && <p className="muted">Bạn chưa đăng ký khoá học nào.</p>}
          {courses.slice(0, 4).map((c) => (
            <div className="list-item" key={c.id}>
              <div style={{ flex: 1 }}>
                <Link href={`/learning/courses/${c.id}`}><strong>{c.title}</strong></Link>
                <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${c.percentComplete}%` }} /></div>
              </div>
              <span className="small muted">{c.percentComplete}%</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Dashboard user={user} />}</RequireAuth>;
}
