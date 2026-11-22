// Font tự host qua @fontsource (woff2 trong node_modules, Next đóng gói lúc build) — `next build` chạy được không cần mạng.
// Inter: chữ giao diện (có bộ glyph tiếng Việt, Be Vietnam Pro làm dự phòng); JetBrains Mono: số liệu, mã giao dịch. Xem design-system/README.md.
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/barlow-condensed/vietnamese-700.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/vietnamese-800.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/inter/vietnamese-400.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/vietnamese-500.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/vietnamese-600.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/vietnamese-700.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/vietnamese-400.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/vietnamese-500.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import Chrome from "@/components/shell/Chrome";
import { THEME_BOOT_SCRIPT } from "@/components/shell/theme-boot";

export const metadata: Metadata = {
  title: "MentorHub — Nền tảng kết nối Mentor-Mentee lập trình",
  description: "Đồ án tốt nghiệp: học tập và kết nối mentor-mentee với AI Matching, phỏng vấn AI xác thực mentor và CV enrichment.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <Chrome>{children}</Chrome>
        </AuthProvider>
      </body>
    </html>
  );
}
