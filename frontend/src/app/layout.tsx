// Font tự host qua @fontsource (file woff2 nằm trong node_modules, được Next đóng gói lúc build) —
// không tải từ Google Fonts nên `next build` chạy được cả khi không có mạng (Docker build).
// DESIGN.md: 'feather' → thay bằng Nunito Black; 'duolingo-sans' → thay bằng Nunito Sans (hỗ trợ tiếng Việt).
// Mỗi file CSS khai báo @font-face kèm unicode-range, trình duyệt chỉ tải subset cần dùng.
import "@fontsource/nunito/latin-900.css";
import "@fontsource/nunito/latin-ext-900.css";
import "@fontsource/nunito/vietnamese-900.css";
import "@fontsource/nunito-sans/latin-500.css";
import "@fontsource/nunito-sans/latin-ext-500.css";
import "@fontsource/nunito-sans/vietnamese-500.css";
import "@fontsource/nunito-sans/latin-700.css";
import "@fontsource/nunito-sans/latin-ext-700.css";
import "@fontsource/nunito-sans/vietnamese-700.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import TimeZoneScope from "@/components/TimeZoneScope";

export const metadata: Metadata = {
  title: "MentorHub — Nền tảng kết nối Mentor-Mentee lập trình",
  description: "Đồ án tốt nghiệp: học tập và kết nối mentor-mentee với AI Matching, AI Interview và CV enrichment.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <Nav />
          <main className="container"><TimeZoneScope>{children}</TimeZoneScope></main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
