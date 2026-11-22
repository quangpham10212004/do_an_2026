import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck, Check, FileText, LineChart, Sparkles } from "lucide-react";
import { Avatar, ButtonLink, Chip, Chips, ScoreRing, Stars } from "@/components/ui";

/* Nội dung theo bản thiết kế Main (desktop) và Mobile. Dữ liệu mentor và blog là dữ liệu mẫu, không gọi API. */

const STATS = [
  { value: "100%", text: "Mentor qua phỏng vấn và duyệt tay" },
  { value: "4", text: "Bước từ đăng ký tới buổi học đầu" },
  { value: "60'", text: "Mỗi phiên, giờ hiển thị theo múi giờ của bạn" },
  { value: "AI", text: "Giải thích lý do cho từng gợi ý", solid: true },
];

const FEATURES = [
  { icon: Sparkles, title: "AI Matching hiểu mục tiêu", body: "So khớp kỹ năng, mục tiêu và lịch rảnh bằng embedding trên hồ sơ và CV. Bỏ qua mentor đã kín lịch, điểm phù hợp kèm lý do dễ hiểu." },
  { icon: CalendarCheck, title: "Đặt lịch không rườm rà", body: "Chọn giờ trong lịch rảnh thật của mentor. Tiền được giữ an toàn tới khi phiên hoàn tất, đổi lịch bất kỳ lúc nào trước giờ bắt đầu." },
  { icon: LineChart, title: "Học có theo dõi", body: "Ghi chú sau mỗi phiên, mục tiêu chung và việc cần làm với mentor, cùng blog kinh nghiệm từ cộng đồng mentor và mentee." },
];

const STEPS = [
  { icon: FileText, title: "Tải CV, làm rõ mục tiêu", body: "Chatbot chỉ hỏi thêm điều CV chưa nói: bạn muốn đi đâu, trong bao lâu." },
  { icon: Sparkles, title: "AI gợi ý mentor", body: "So khớp hồ sơ với mentor và giải thích vì sao mỗi người phù hợp." },
  { icon: CalendarCheck, title: "Đặt lịch và thanh toán", body: "Chọn khung giờ, thanh toán sandbox, nhận nhắc lịch theo múi giờ của bạn." },
  { icon: BadgeCheck, title: "Học có theo dõi", body: "Ghi chú phiên, mục tiêu chung và việc cần làm giúp theo dõi tiến độ." },
];

const MENTORS = [
  { name: "Trần Quốc Bảo", role: "Senior Backend Engineer · 8 năm", rating: 4.8, count: 36, tags: ["Java", "Spring Boot"] },
  { name: "Lê Minh Châu", role: "Frontend Lead · 6 năm", rating: 4.9, count: 28, tags: ["React", "TypeScript"] },
  { name: "Phạm Gia Huy", role: "Data Engineer · 7 năm", rating: 4.7, count: 22, tags: ["Python", "Spark"] },
];

const POSTS = [
  { title: "Chuyển từ làm tự do sang backend Java trong 6 tháng", tag: "Kinh nghiệm", meta: "5 phút đọc" },
  { title: "Cách chuẩn bị CV để mentor hiểu mục tiêu của bạn", tag: "CV", meta: "4 phút đọc" },
  { title: "Một buổi mentoring hiệu quả trông như thế nào", tag: "Mentoring", meta: "6 phút đọc" },
];

function Tick({ children }: { children: ReactNode }) {
  return <li><Check aria-hidden="true" />{children}</li>;
}

/** Thẻ minh hoạ kết quả AI Matching (dữ liệu ví dụ). */
function MatchPreview() {
  return (
    <div className="lp-window" role="img" aria-label="Ví dụ kết quả AI Matching: Trần Quốc Bảo, điểm phù hợp 92 trên 100">
      <div className="lp-window-head">
        <div>
          <div className="lp-kicker">AI Matching</div>
          <div className="lp-window-title">Mentor phù hợp nhất</div>
        </div>
        <span className="lp-pill-solid">Đề xuất</span>
      </div>
      <div className="lp-window-person">
        <Avatar name="Trần Quốc Bảo" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="lp-person-name">Trần Quốc Bảo</div>
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
      <p className="lp-window-note">Cùng hướng chuyển sang backend Java, lịch rảnh tối thứ Ba và thứ Năm khớp với bạn.</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <section id="top" className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <span className="lp-badge"><span className="lp-dot" aria-hidden="true" />Mentor được duyệt thủ công</span>
            <h1>Tìm đúng<br /><span className="hl">mentor</span><br />cho bạn</h1>
            <p className="lead">
              MentorHub đọc CV và mục tiêu của bạn, gợi ý mentor đã qua phỏng vấn, rồi cùng bạn học hiệu quả: đặt lịch, ghi chú phiên,
              mục tiêu chung và việc cần làm.
            </p>
            <div className="lp-cta">
              <ButtonLink href="/register" className="btn-highlight" icon={ArrowRight}>Bắt đầu miễn phí</ButtonLink>
              <ButtonLink href="/login" className="btn-on-navy">Tôi đã có tài khoản</ButtonLink>
            </div>
          </div>
          <div className="lp-stage">
            <MatchPreview />
            <div className="lp-float">
              <CalendarCheck aria-hidden="true" />Phiên thứ Ba · 19:30 · đã đặt lịch
            </div>
          </div>
        </div>
      </section>

      <section className="lp-wrap lp-stats" aria-label="Con số nổi bật">
        {STATS.map((s) => (
          <div key={s.value} className={s.solid ? "lp-stat solid" : "lp-stat"}>
            <div className="num">{s.value}</div>
            <div className="txt">{s.text}</div>
          </div>
        ))}
      </section>

      <section id="tinh-nang" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">Tính năng</div>
          <h2 className="lp-h2">Mọi thứ để học cùng mentor, <span className="hl">trong một nơi</span></h2>
          <div className="lp-features">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="lp-feature-card">
                <span className="ico"><Icon aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="cach-hoat-dong" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">Cách hoạt động</div>
          <h2 className="lp-h2">Bốn bước tới buổi học đầu tiên</h2>
          <ol className="lp-steps">
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className="lp-step">
                <span className="no">0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="mentor" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">Mentor nổi bật</div>
          <h2 className="lp-h2">Mentor đã qua <span className="hl">xác thực</span></h2>
          <ul className="lp-mentors">
            {MENTORS.map((m) => (
              <li key={m.name} className="lp-mentor">
                <Avatar name={m.name} size="lg" />
                <div className="min-w-0">
                  <div className="lp-person-name">{m.name}</div>
                  <div className="text-small text-ink-muted">{m.role}</div>
                  <Stars value={m.rating} count={m.count} />
                  <Chips className="mt-2">{m.tags.map((t) => <Chip key={t} match>{t}</Chip>)}</Chips>
                </div>
              </li>
            ))}
          </ul>
          <p className="lp-note">Hồ sơ mẫu để minh hoạ. Danh sách mentor thật hiện sau khi bạn đăng nhập.</p>
        </div>
      </section>

      <section id="vai-tro" className="lp-section">
        <div className="lp-wrap">
          <h2 className="lp-h2">Bạn muốn <span className="hl">học</span> hay muốn <span className="hl">dạy</span>?</h2>
          <div className="lp-plans">
            <div className="lp-plan">
              <h3>Mentee</h3>
              <div className="price">Miễn phí · trả theo phiên</div>
              <ul>
                <Tick>Gợi ý mentor bằng AI Matching</Tick>
                <Tick>Đặt lịch, nhắn tin, ghi chú phiên</Tick>
                <Tick>Đọc và viết blog, theo dõi tiến độ</Tick>
              </ul>
              <ButtonLink href="/register" className="btn-highlight" block>Đăng ký làm mentee</ButtonLink>
            </div>
            <div className="lp-plan featured">
              <h3>Mentor</h3>
              <div className="price">Tự đặt giá · theo giờ</div>
              <ul>
                <Tick>Xác thực qua phỏng vấn AI trực tiếp, quản trị viên duyệt khi cần</Tick>
                <Tick>Tự đặt lịch rảnh và đơn giá</Tick>
                <Tick>Thu nhập giữ an toàn tới khi phiên hoàn tất</Tick>
              </ul>
              <ButtonLink href="/register" className="btn-highlight" block>Đăng ký làm mentor</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section id="blog" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">Blog</div>
          <h2 className="lp-h2">Kinh nghiệm từ <span className="hl">cộng đồng</span></h2>
          <ul className="lp-posts">
            {POSTS.map((p) => (
              <li key={p.title}>
                <Link href="/blog" className="lp-post">
                  <span className="lp-kicker">{p.tag}</span>
                  <h3>{p.title}</h3>
                  <span className="text-small text-ink-muted">{p.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-wrap lp-cta-wrap">
        <div className="lp-band">
          <h2>Sẵn sàng gặp<br /><span className="hl">mentor phù hợp?</span></h2>
          <p>Tạo tài khoản trong vài phút, nhận gợi ý đầu tiên ngay sau khi hoàn thành hồ sơ.</p>
          <div className="lp-cta">
            <ButtonLink href="/register" className="btn-highlight" icon={ArrowRight}>Bắt đầu miễn phí</ButtonLink>
            <ButtonLink href="/blog" className="btn-on-navy">Đọc blog</ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
