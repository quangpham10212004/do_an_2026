"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap, Presentation } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import WelcomeAlerts from "@/components/WelcomeAlerts";
import { ButtonLink, PageHeader } from "@/components/ui";
import type { Role, SessionUser } from "@/types";

const PATHS: { role: Exclude<Role, "ADMIN">; title: string; icon: typeof GraduationCap; steps: string[] }[] = [
  { role: "MENTEE", title: "Mentee", icon: GraduationCap, steps: ["Tải CV", "AI đọc CV", "Chatbot hỏi thêm điều CV chưa nói", "Nhận gợi ý mentor"] },
  { role: "MENTOR", title: "Mentor", icon: Presentation, steps: ["Tải CV", "Phỏng vấn AI trực tiếp (trả lời bằng giọng nói, có quay video)", "Xem kết quả", "Admin xem xét nếu AI chưa chắc chắn"] },
];

function Next({ user }: { user: SessionUser }) {
  const mine = user.role === "MENTOR" ? "MENTOR" : "MENTEE";
  return (
    <div className="mx-auto max-w-[920px]">
      <WelcomeAlerts welcome="Chào mừng bạn đến với MentorHub! Chọn bước tiếp theo để hoàn thiện hồ sơ." />
      <PageHeader title="Đi tiếp theo vai trò của bạn" description="Mỗi vai trò có một lộ trình ngắn. Bạn có thể dừng lại và làm tiếp sau." />
      <div className="ob-next">
        {PATHS.map(({ role, title, icon: Icon, steps }) => (
          <section key={role} className="ob-next-card" data-current={role === mine} aria-label={`Lộ trình ${title}`}>
            <div className="flex items-center gap-3">
              <span className="ob-file-ico"><Icon aria-hidden="true" className="size-5" /></span>
              <h2 className="text-title-2 font-semibold">{title}</h2>
              {role === mine && <span className="badge badge-accent">Vai trò của bạn</span>}
            </div>
            <ol className="ob-next-steps">
              {steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            {role === mine && (
              <div className="mt-auto flex flex-col items-stretch gap-1">
                {role === "MENTEE" ? (
                  <>
                    <ButtonLink href="/cv-enrichment" variant="primary" size="lg" block>Tải CV<ArrowRight aria-hidden="true" /></ButtonLink>
                    <div className="ob-link-row">Chưa có CV? <Link href="/onboarding/manual">Điền thông tin thủ công</Link></div>
                  </>
                ) : (
                  <ButtonLink href="/onboarding/mentor-cv" variant="primary" size="lg" block>Tải CV mentor<ArrowRight aria-hidden="true" /></ButtonLink>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="ob-link-row mt-4"><Link href="/dashboard">Làm sau</Link></div>
    </div>
  );
}

export default function OnboardingNextPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Next user={user} />}</RequireAuth>;
}
