"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarCheck, FileText, Sparkles } from "lucide-react";
import { homePathFor, useAuth } from "@/lib/auth";
import { Avatar, Badge, ButtonLink, Chip, Chips, ScoreRing, Stars } from "@/components/ui";

// Quy trình thật của mentee, theo đúng thứ tự (nên được đánh số).
const STEPS = [
  { icon: FileText, title: "Tải CV, làm rõ mục tiêu", body: "Hệ thống đọc kỹ năng và dự án trong CV. Chatbot chỉ hỏi thêm điều CV chưa nói: bạn muốn đi đâu, trong bao lâu, cần hỗ trợ gì." },
  { icon: Sparkles, title: "AI Matching gợi ý mentor", body: "So khớp hồ sơ của bạn với mentor bằng embedding, bỏ qua người đã kín lịch, và giải thích vì sao mỗi người phù hợp." },
  { icon: CalendarCheck, title: "Đặt lịch và thanh toán", body: "Chọn khung giờ trong lịch rảnh của mentor, thanh toán sandbox, nhận nhắc lịch theo múi giờ của bạn." },
  { icon: BadgeCheck, title: "Học có lộ trình", body: "Ghi chú phiên, mục tiêu chung với mentor và roadmap trên Learning Hub giúp bạn theo dõi tiến độ." },
];

/** Thẻ minh hoạ kết quả AI Matching (dữ liệu ví dụ). */
function MatchPreview() {
  return (
    <div className="card w-full max-w-[440px]" aria-label="Ví dụ kết quả AI Matching">
      <div className="card-head">
        <div>
          <div className="eyebrow">Ví dụ · AI Matching</div>
          <h2 className="mt-1">Mentor phù hợp nhất với bạn</h2>
        </div>
        <Badge tone="accent">Đề xuất</Badge>
      </div>
      <div className="card-body flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name="Trần Quốc Bảo" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-title-3 font-semibold">Trần Quốc Bảo</div>
            <div className="text-small text-ink-muted">Senior Backend Engineer · 8 năm</div>
            <Stars value={4.8} count={36} />
          </div>
          <ScoreRing value={92} label="Điểm phù hợp 92/100" />
        </div>
        <Chips>
          <Chip match>Java</Chip>
          <Chip match>Spring Boot</Chip>
          <Chip>PostgreSQL</Chip>
          <Chip>System design</Chip>
        </Chips>
        <div className="flex flex-col gap-2">
          <div className="meter" aria-hidden="true">
            <span style={{ width: "48%" }} />
            <span style={{ width: "30%" }} />
            <span style={{ width: "14%" }} />
          </div>
          <div className="legend">
            <span><i />Kỹ năng</span>
            <span><i />Mục tiêu</span>
            <span><i />Lịch rảnh</span>
          </div>
        </div>
        <p className="well text-small text-ink-muted">
          Cùng hướng chuyển sang backend Java, có lịch rảnh tối thứ Ba và thứ Năm khớp với bạn.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const { ready, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace(homePathFor(user.role));
  }, [ready, user, router]);

  return (
    <>
      <section className="mx-auto grid max-w-[1160px] items-center gap-12 px-6 py-16 max-md:px-4 max-md:py-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="eyebrow">Mentoring cho người học lập trình</div>
          <h1 className="text-display max-sm:text-[30px] max-sm:leading-[38px]">
            Tìm đúng mentor cho con đường lập trình của bạn
          </h1>
          <p className="max-w-[56ch] text-body-lg text-ink-muted">
            MentorHub đọc CV và mục tiêu của bạn, gợi ý mentor đã qua phỏng vấn, rồi giúp hai bên học có lộ trình: đặt lịch,
            ghi chú phiên, mục tiêu chung và roadmap.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/register" variant="primary" size="lg" icon={ArrowRight}>Bắt đầu miễn phí</ButtonLink>
            <ButtonLink href="/login" size="lg">Tôi đã có tài khoản</ButtonLink>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <MatchPreview />
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1160px] px-6 py-14 max-md:px-4">
          <h2 className="text-title-1 font-semibold">Cách MentorHub hoạt động</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-md bg-accent-soft text-accent-ink">
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <span className="font-mono text-small text-ink-subtle">Bước {i + 1}</span>
                </div>
                <h3 className="text-title-3 font-semibold">{title}</h3>
                <p className="text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1160px] gap-10 px-6 py-14 max-md:px-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-title-1 font-semibold">Mentor được xác thực trước khi nhận học viên</h2>
          <p className="text-body-lg text-ink-muted">
            Mỗi mentor hoàn thành AI Interview nhiều lượt về chuyên môn và cách hướng dẫn, sau đó quản trị viên duyệt kết quả.
            Chỉ mentor đã duyệt mới xuất hiện trong gợi ý.
          </p>
        </div>
        <div className="card">
          <div className="card-body flex flex-col gap-3">
            <div className="text-title-3 font-semibold">Bạn muốn trở thành mentor?</div>
            <p className="text-ink-muted">
              Tạo tài khoản mentor, hoàn thành AI Interview, đặt lịch rảnh và đơn giá theo giờ. Thu nhập được giữ an toàn tới khi
              phiên học hoàn tất.
            </p>
            <div>
              <ButtonLink href="/register" icon={ArrowRight}>Đăng ký làm mentor</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
