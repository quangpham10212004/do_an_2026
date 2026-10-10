"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
import { Brand } from "./AppShell";

/** Khung trang công khai (giới thiệu, đăng nhập, đăng ký, khôi phục mật khẩu). */
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="public-header">
        <div className="public-header-inner">
          <Brand href="/" />
          <div className="flex-1" />
          <ButtonLink href="/login" variant="ghost">Đăng nhập</ButtonLink>
          <ButtonLink href="/register" variant="primary">Tạo tài khoản</ButtonLink>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>
            <div className="font-semibold text-ink">MentorHub</div>
            <div>Nền tảng kết nối mentor-mentee lập trình · Đồ án tốt nghiệp lớp E22CNPM03</div>
          </div>
          <div>
            <div>Phạm Ngọc Quang · Đinh Quyết Thắng · Phạm Ninh Phương Thảo</div>
            <div>GVHD: Đào Ngọc Phong · <Link href="/register">Bắt đầu miễn phí</Link></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
