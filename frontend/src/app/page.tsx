"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePathFor, useAuth } from "@/lib/auth";

// Bố cục editorial theo DESIGN.md: mỗi section một khối chữ + một minh hoạ, xen kẽ trái/phải, không lưới thẻ.
const SECTIONS = [
  ["🎯", "gợi ý đúng mentor.", "AI Matching so khớp hồ sơ của bạn với hàng trăm mentor bằng embedding, loại những người đã kín lịch hoặc chưa được xác thực, rồi giải thích rõ vì sao mỗi mentor phù hợp."],
  ["📄", "hiểu rõ mục tiêu.", "Tải CV lên, hệ thống tự đọc kỹ năng và dự án của bạn. Chatbot chỉ hỏi thêm những điều CV chưa nói — bạn muốn đi đâu, trong bao lâu, cần hỗ trợ gì."],
  ["🤖", "mentor đã qua phỏng vấn.", "Mỗi mentor phải hoàn thành AI Interview nhiều lượt và được quản trị viên duyệt trước khi xuất hiện trong kết quả gợi ý."],
  ["📅", "đặt lịch trong vài giây.", "Chọn khung giờ trong lịch rảnh của mentor, thanh toán sandbox, nhận nhắc lịch và đánh giá sau buổi học. Học thêm trên Learning Hub với roadmap theo từng hướng đi."],
];

export default function Home() {
  const { ready, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace(homePathFor(user.role));
  }, [ready, user, router]);

  return (
    <>
      <section className="hero">
        <div>
          <h1 className="display">học đúng hướng, cùng mentor.</h1>
          <h2>Nền tảng kết nối mentor-mentee trong lĩnh vực lập trình</h2>
          <p>
            MentorHub dùng AI để hiểu mục tiêu của bạn, tìm mentor phù hợp và giúp bạn học tập có lộ trình — miễn phí để bắt đầu.
          </p>
          <div className="row" style={{ marginTop: "var(--spacing-24)" }}>
            <Link href="/register" className="btn">Bắt đầu ngay</Link>
            <Link href="/login" className="btn secondary">Tôi đã có tài khoản</Link>
          </div>
        </div>
        <div className="section-art" aria-hidden="true">🦉</div>
      </section>

      {SECTIONS.map(([art, title, body], i) => (
        <section key={title} className={`section ${i % 2 === 0 ? "reverse" : ""}`}>
          <div>
            <h2 className="display md">{title}</h2>
            <p>{body}</p>
          </div>
          <div className="section-art" aria-hidden="true">{art}</div>
        </section>
      ))}
    </>
  );
}
