"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, LogOut, Menu, Monitor, Moon, Settings, Sun, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import type { NotificationList, SessionUser } from "@/types";
import { Avatar, Button, Count } from "@/components/ui";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { ACCOUNT_LINKS, NAV, activeItem } from "./nav";
import ThemeToggle from "./ThemeToggle";
import { useTheme, type ThemeChoice } from "./theme";

export function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="sidebar-brand">
      <span className="brand-mark" aria-hidden="true">M</span>
      MentorHub
    </Link>
  );
}

/** Đếm thông báo + tin nhắn chưa đọc, làm mới mỗi 30 giây và khi đổi trang. */
function useUnread(user: SessionUser, pathname: string) {
  const [notifications, setNotifications] = useState(0);
  const [messages, setMessages] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      api<NotificationList>("/api/mentoring/notifications?limit=1")
        .then((res) => active && setNotifications(res.unreadCount))
        .catch(() => {});
      // US-33 (PRD-MSG-2) — số tin nhắn chưa đọc trên mục "Tin nhắn".
      if (user.role !== "ADMIN") {
        api<{ unread: number }>("/api/mentoring/conversations/unread-count")
          .then((res) => active && setMessages(res.unread))
          .catch(() => {});
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, pathname]);
  return { notifications, messages };
}

const THEME_OPTIONS: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Sáng", icon: Sun },
  { id: "dark", label: "Tối", icon: Moon },
  { id: "system", label: "Theo hệ thống", icon: Monitor },
];

function UserMenu({ user }: { user: SessionUser }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user.fullName || user.email;
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar name={name} size="sm" />
        <span className="hide-mobile max-w-[160px] truncate font-medium">{name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div className="truncate font-semibold">{name}</div>
            <div className="text-small text-ink-muted">{ROLE_LABELS[user.role]} · {user.email}</div>
          </div>
          <Link href="/account" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Settings aria-hidden="true" />
            Tài khoản & bảo mật
          </Link>
          {ACCOUNT_LINKS[user.role].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
          <div className="px-3 pb-1 pt-2 eyebrow">Giao diện</div>
          {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="menu-item" role="menuitemradio" aria-checked={theme === id} onClick={() => setTheme(id)}>
              <Icon aria-hidden="true" />
              {label}
              {theme === id && <span className="ml-auto text-accent" aria-hidden="true">●</span>}
            </button>
          ))}
          <hr className="divider my-1" />
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={async () => {
              await logout();
              router.push("/");
            }}
          >
            <LogOut aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/** Khung ứng dụng sau đăng nhập: sidebar nhóm theo vai trò + thanh trên (tiêu đề, thông báo, tài khoản). */
export default function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const unread = useUnread(user, pathname);
  const current = activeItem(user.role, pathname);
  const home = user.role === "ADMIN" ? "/admin" : "/dashboard";

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="shell">
      <div className="drawer-backdrop" data-open={drawer} onClick={() => setDrawer(false)} />
      <aside className="sidebar" data-open={drawer} aria-label="Điều hướng chính">
        <div className="flex items-center justify-between pr-3">
          <Brand href={home} />
          <Button variant="ghost" iconOnly icon={X} label="Đóng menu" className="topbar-menu" onClick={() => setDrawer(false)} />
        </div>
        <nav className="nav">
          {NAV[user.role].map((group, i) => (
            <div key={group.label ?? i} className="nav-group">
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="nav-item" aria-current={current?.href === item.href ? "page" : undefined}>
                    <Icon aria-hidden="true" />
                    {item.label}
                    {item.badge === "messages" && <Count value={unread.messages} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot text-small text-ink-subtle">
          Đồ án tốt nghiệp · E22CNPM03
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="topbar">
          <Button variant="ghost" iconOnly icon={Menu} label="Mở menu" className="topbar-menu" onClick={() => setDrawer(true)} />
          <div className="topbar-title">{current?.label ?? ""}</div>
          <ThemeToggle />
          <Link href="/notifications" className="btn btn-ghost btn-icon bell" aria-label={`Thông báo${unread.notifications ? ` (${unread.notifications} chưa đọc)` : ""}`}>
            <Bell aria-hidden="true" />
            <Count value={unread.notifications} />
          </Link>
          <UserMenu user={user} />
        </header>
        <VerifyEmailBanner />
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
