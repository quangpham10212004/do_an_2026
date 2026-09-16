"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

const LINKS = {
  MENTEE: [
    ["/dashboard", "Trang chủ"],
    ["/profile", "Hồ sơ"],
    ["/matching", "Tìm mentor"],
    ["/mentoring/requests", "Yêu cầu"],
    ["/mentoring/sessions", "Phiên học"],
    ["/learning", "Learning Hub"],
    ["/referral", "Giới thiệu"],
  ],
  MENTOR: [
    ["/dashboard", "Trang chủ"],
    ["/profile", "Hồ sơ"],
    ["/interview", "AI Interview"],
    ["/mentoring/requests", "Yêu cầu"],
    ["/mentoring/sessions", "Phiên học"],
    ["/learning", "Learning Hub"],
    ["/referral", "Giới thiệu"],
  ],
  ADMIN: [
    ["/admin", "Tổng quan"],
    ["/admin/users", "Người dùng"],
    ["/admin/interviews", "Duyệt mentor"],
    ["/admin/learning", "Nội dung"],
    ["/admin/transactions", "Giao dịch"],
  ],
};

export default function Nav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () =>
      api("/api/mentoring/notifications?limit=1")
        .then((res) => active && setUnread(res.unreadCount))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, pathname]);

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href={user ? (user.role === "ADMIN" ? "/admin" : "/dashboard") : "/"} className="brand">
          Mentor<span>Hub</span>
        </Link>
        <div className="nav-links">
          {user &&
            (LINKS[user.role] || []).map(([href, label]) => (
              <Link key={href} href={href} className={pathname === href || (href !== "/admin" && href !== "/dashboard" && pathname.startsWith(href)) ? "active" : ""}>
                {label}
              </Link>
            ))}
        </div>
        {user ? (
          <div className="nav-user">
            <Link href="/notifications" className="bell" title="Thông báo">
              🔔{unread > 0 && <span className="dot">{unread}</span>}
            </Link>
            <Link href="/account" className="muted">
              {user.fullName || user.email} · {ROLE_LABELS[user.role]}
            </Link>
            <button
              className="btn secondary sm"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
            >
              Đăng xuất
            </button>
          </div>
        ) : (
          <div className="nav-user">
            <Link href="/login" className="btn secondary sm">Đăng nhập</Link>
            <Link href="/register" className="btn sm">Đăng ký</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
