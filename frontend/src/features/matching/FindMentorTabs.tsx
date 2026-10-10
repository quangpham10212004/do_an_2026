"use client";

import Link from "next/link";

/** "Tìm mentor" là một mục duy nhất: gợi ý của AI (/matching) hoặc tự duyệt toàn bộ (/mentors). */
export default function FindMentorTabs({ current }: { current: "matching" | "mentors" }) {
  return (
    <nav className="tabs mb-6" aria-label="Cách tìm mentor">
      <Link href="/matching" className="tab" aria-current={current === "matching" ? "page" : undefined}>Gợi ý cho bạn</Link>
      <Link href="/mentors" className="tab" aria-current={current === "mentors" ? "page" : undefined}>Tất cả mentor</Link>
    </nav>
  );
}
