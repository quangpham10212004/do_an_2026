import { Nunito, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

// DESIGN.md: 'feather' → thay bằng Nunito Black; 'duolingo-sans' → thay bằng Nunito Sans (hỗ trợ tiếng Việt)
const nunito = Nunito({ subsets: ["latin", "vietnamese"], weight: ["900"], variable: "--font-nunito", display: "swap" });
const nunitoSans = Nunito_Sans({ subsets: ["latin", "vietnamese"], weight: ["500", "700"], variable: "--font-nunito-sans", display: "swap", adjustFontFallback: false });

export const metadata = {
  title: "MentorHub — Nền tảng kết nối Mentor-Mentee lập trình",
  description: "Đồ án tốt nghiệp: học tập và kết nối mentor-mentee với AI Matching, AI Interview và CV enrichment.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <body>
        <AuthProvider>
          <Nav />
          <main className="container">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
