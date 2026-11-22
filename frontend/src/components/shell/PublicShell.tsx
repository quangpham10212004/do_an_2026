"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { Brand } from "./AppShell";

const NAV = [
  { href: "/#tinh-nang", label: "Tính năng" },
  { href: "/#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "/#vai-tro", label: "Vai trò" },
  { href: "/blog", label: "Blog" },
];

/** Khung trang công khai (giới thiệu, đăng nhập, đăng ký, khôi phục mật khẩu, điều khoản). */
export default function PublicShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="public-header">
        <div className="public-header-inner">
          <Brand href="/" />
          <nav className="public-nav" aria-label="Điều hướng chính">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
          </nav>
          <div className="flex-1" />
          <ButtonLink href="/login" variant="ghost" className="hide-mobile">Đăng nhập</ButtonLink>
          <ButtonLink href="/register" className="btn-highlight">Bắt đầu</ButtonLink>
          <button
            type="button"
            className="btn btn-secondary btn-icon public-menu-btn"
            aria-label={open ? "Đóng menu" : "Mở menu"}
            aria-expanded={open}
            aria-controls="public-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        <nav id="public-menu" className={open ? "public-menu open" : "public-menu"} aria-label="Menu di động">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>{n.label}</Link>)}
          <Link href="/login" onClick={() => setOpen(false)}>Đăng nhập</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span>© 2026 MentorHub</span>
          <span className="public-footer-links">
            <Link href="/blog">Blog</Link>
            <Link href="/login">Đăng nhập</Link>
            <Link href="/register">Đăng ký</Link>
            <Link href="/terms">Điều khoản</Link>
            <Link href="/privacy">Chính sách bảo mật</Link>
          </span>
        </div>
        <div className="public-footer-credit">Đồ án tốt nghiệp lớp E22CNPM03 · Phạm Ngọc Quang, Đinh Quyết Thắng, Phạm Ninh Phương Thảo · GVHD: Đào Ngọc Phong</div>
      </footer>
    </div>
  );
}
