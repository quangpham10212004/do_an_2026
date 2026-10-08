import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

// Chạy trước khi hydrate để tránh nháy sáng/tối (FOUC) khi người dùng đã chọn light/dark trước đó.
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('mentorhub-theme');if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();`;

// Theme "developer tool": Space Grotesk cho display/heading, Inter cho nội dung, JetBrains Mono cho số liệu/code.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const inter = Inter({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata = {
  title: "MentorHub — Nền tảng kết nối Mentor-Mentee lập trình",
  description: "Đồ án tốt nghiệp: học tập và kết nối mentor-mentee với AI Matching, AI Interview và CV enrichment.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>
            <Nav />
            <main className="container">{children}</main>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
