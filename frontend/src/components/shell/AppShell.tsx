"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { api } from "@/lib/api";
import type { NotificationList, SessionUser } from "@/types";
import { Avatar, Button } from "@/components/ui";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { NAV, TAB_ICONS, TOP_NAV, activeItem, activeTop, mobileTabs } from "./nav";
import { mentoringApi } from "@/features/mentoring/api";
import { paymentApi } from "@/features/payment/api";
import { verifyAdminApi } from "@/features/verification/api";
import { AccountMenu, DrawerBody, MessagesButton, NotificationBell } from "./HeaderMenus";

export function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="sidebar-brand">
      <span className="brand-mark" aria-hidden="true">M</span>
      MentorHub
    </Link>
  );
}

/** Đếm thông báo + tin nhắn chưa đọc, làm mới mỗi 30 giây, khi đổi trang và khi gọi refresh(). */
function useUnread(user: SessionUser, pathname: string) {
  const [notifications, setNotifications] = useState(0);
  const [messages, setMessages] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      api<NotificationList>("/api/mentoring/notifications?limit=1")
        .then((res) => active && setNotifications(res.unreadCount))
        .catch(() => {});
      // US-33 (PRD-MSG-2) — số tin nhắn chưa đọc.
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
  }, [user, pathname, tick]);
  return { notifications, messages, refresh: useCallback(() => setTick((n) => n + 1), []) };
}

/**
 * Huy hiệu đếm trên sidebar admin: xác thực chờ (GET /api/admin/verification/queue -> counts.PENDING),
 * tranh chấp đang mở, yêu cầu rút tiền, báo cáo tin nhắn mở. Lỗi một nguồn thì bỏ huy hiệu đó.
 */
function useAdminCounts(enabled: boolean, pathname: string): Record<string, number> {
  const [c, setC] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const set = (k: string, n: number) => live && setC((o) => ({ ...o, [k]: n }));
    verifyAdminApi.queue("UNCLEAR", "").then((r) => set("verification", r.counts?.UNCLEAR ?? r.stats.unclear)).catch(() => {});
    mentoringApi.adminDisputes("ACTIVE").then((r) => set("disputes", r.length)).catch(() => {});
    paymentApi.adminPayouts("REQUESTED").then((r) => set("payouts", r.length)).catch(() => {});
    mentoringApi.adminMessageReports("OPEN").then((r) => set("reports", r.length)).catch(() => {});
    return () => { live = false; };
  }, [enabled, pathname]);
  return c;
}

/** Khung dành cho mentee và mentor: thanh trên cùng (logo, điều hướng ngang, tin nhắn, chuông, menu tài khoản). */
function TopShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const role = user.role as "MENTEE" | "MENTOR";
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const unread = useUnread(user, pathname);
  const current = activeTop(role, pathname);

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-screen">
      <header className="app-top">
        <div className="app-top-inner">
          <Link href="/dashboard" className="app-brand">
            <span className="brand-mark" aria-hidden="true">M</span>
            MentorHub
          </Link>
          <nav className="app-nav" aria-label="Điều hướng chính">
            {TOP_NAV[role].map((item) => (
              <Link key={item.href} href={item.href} aria-current={current === item.href ? "page" : undefined}>{item.label}</Link>
            ))}
          </nav>
          <div className="app-actions">
            <span className="app-desk"><MessagesButton unread={unread.messages} /></span>
            <NotificationBell unread={unread.notifications} onChanged={unread.refresh} />
            <span className="app-desk"><AccountMenu user={user} /></span>
            <button type="button" className="app-menu-btn" aria-label="Mở menu" aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <Avatar name={user.fullName || user.email} size="sm" />
            </button>
          </div>
        </div>
      </header>
      <div className="app-drawer-backdrop" data-open={drawer} onClick={() => setDrawer(false)} />
      <aside className="app-drawer" data-open={drawer} role="dialog" aria-label="Menu" aria-hidden={!drawer}>
        <DrawerBody user={user} nav={TOP_NAV[role]} current={current} onClose={() => setDrawer(false)} />
      </aside>
      <VerifyEmailBanner />
      <main className="app-main">{children}</main>
      <nav className="app-tabbar" aria-label="Thanh tab">
        {mobileTabs(role).map((item) => {
          const Icon = TAB_ICONS[item.href] ?? Menu;
          const count = item.badge === "messages" ? unread.messages : 0;
          const here = item.href === "/messages" ? pathname === "/messages" || pathname.startsWith("/messages/") : current === item.href;
          return (
            <Link key={item.href} href={item.href} aria-current={here ? "page" : undefined}
              aria-label={count ? `${item.label}, ${count} chưa đọc` : undefined}>
              <span className="tab-ico"><Icon aria-hidden="true" />{count > 0 && <span className="icon-badge is-accent">{count > 99 ? "99+" : count}</span>}</span>
              <span className="tab-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Khung quản trị: thanh bên nhóm theo chủ đề + thanh trên nhỏ có chuông và menu tài khoản. */
function AdminShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const unread = useUnread(user, pathname);
  const current = activeItem(user.role, pathname);
  const counts = useAdminCounts(true, pathname);

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="shell">
      <div className="drawer-backdrop" data-open={drawer} onClick={() => setDrawer(false)} />
      <aside className="sidebar" data-open={drawer} aria-label="Điều hướng quản trị">
        <div className="flex items-center justify-between pr-3">
          <Brand href="/admin" />
          <Button variant="ghost" iconOnly icon={X} label="Đóng menu" className="topbar-menu" onClick={() => setDrawer(false)} />
        </div>
        <nav className="nav">
          {NAV.ADMIN.map((group, i) => (
            <div key={group.label ?? i} className="nav-group">
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="nav-item" aria-current={current?.href === item.href ? "page" : undefined}>
                    <Icon aria-hidden="true" />
                    {item.label}
                    {item.badge && item.badge !== "messages" && (counts[item.badge] ?? 0) > 0 && (
                      <span className="count" aria-label={`${counts[item.badge]} mục chờ xử lý`}>{counts[item.badge]}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot text-small text-ink-subtle">Đồ án tốt nghiệp · E22CNPM03</div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="topbar">
          <Button variant="ghost" iconOnly icon={Menu} label="Mở menu" className="topbar-menu" onClick={() => setDrawer(true)} />
          <div className="topbar-title">{current?.label ?? ""}</div>
          <NotificationBell unread={unread.notifications} onChanged={unread.refresh} />
          <AccountMenu user={user} />
        </header>
        <VerifyEmailBanner />
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

export default function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return user.role === "ADMIN" ? <AdminShell user={user}>{children}</AdminShell> : <TopShell user={user}>{children}</TopShell>;
}
