"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, BookOpen, CalendarDays, ChevronDown, ClipboardList, FileText, Gift, LogOut, MessageSquare, PenLine, Library, ShieldCheck, UserRound, Wallet, Banknote, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, formatDateTime, formatVnd } from "@/lib/format";
import { mentoringApi } from "@/features/mentoring/api";
import { paymentApi } from "@/features/payment/api";
import { profileApi } from "@/features/profile/api";
import type { Completeness, MentorStatus, Notification, SessionUser } from "@/types";
import { Avatar } from "@/components/ui";
import { useTheme, type ThemeChoice } from "./theme";

/** Đóng popover khi bấm ra ngoài hoặc nhấn Esc. */
function usePopover() {
  const [open, setOpen] = useState(false);
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
  return { open, setOpen, ref };
}

function notifIcon(type: string): ReactNode {
  const t = type.toUpperCase();
  if (t.includes("PAY") || t.includes("WALLET") || t.includes("REFUND") || t.includes("PAYOUT")) return <Wallet aria-hidden="true" />;
  if (t.includes("BLOG")) return <PenLine aria-hidden="true" />;
  if (t.includes("MESSAGE")) return <MessageSquare aria-hidden="true" />;
  if (t.includes("REFERRAL")) return <Gift aria-hidden="true" />;
  return <CalendarDays aria-hidden="true" />;
}

export function MessagesButton({ unread }: { unread: number }) {
  return (
    <Link href="/messages" className="icon-btn" aria-label={`Tin nhắn${unread ? `, ${unread} chưa đọc` : ""}`}>
      <MessageSquare aria-hidden="true" />
      {unread > 0 && <span className="icon-badge is-accent">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

/** Chuông thông báo: bấm mở danh sách 5 thông báo mới nhất, kèm "Đánh dấu đã đọc" và "Xem tất cả". */
export function NotificationBell({ unread, onChanged }: { unread: number; onChanged: () => void }) {
  const { open, setOpen, ref } = usePopover();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    mentoringApi.notifications(20).then((r) => alive && setItems(r.items)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [open]);

  const shown = (items ?? []).filter((n) => tab === "all" || !n.read).slice(0, 5);
  const markAll = async () => {
    await mentoringApi.markAllRead().catch(() => {});
    setItems((cur) => (cur ?? []).map((n) => ({ ...n, read: true })));
    onChanged();
  };

  return (
    <div className="pop-anchor" ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`} onClick={() => setOpen((v) => !v)}>
        <Bell aria-hidden="true" />
        {unread > 0 && <span className="icon-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="popover" role="menu" aria-label="Thông báo">
          <div className="pop-head">
            <b className="text-title-3">Thông báo</b>
            <button type="button" className="pop-link" onClick={markAll} disabled={unread === 0}>Đánh dấu đã đọc</button>
          </div>
          <div className="flex gap-2 px-[18px] pb-2 pt-3">
            <button type="button" className="chip" aria-pressed={tab === "all"} onClick={() => setTab("all")}>Tất cả</button>
            <button type="button" className="chip" aria-pressed={tab === "unread"} onClick={() => setTab("unread")}>Chưa đọc{unread ? ` (${unread})` : ""}</button>
          </div>
          {items === null && <div className="p-6 text-center text-small text-ink-muted">Đang tải…</div>}
          {items !== null && shown.length === 0 && <div className="p-6 text-center text-small text-ink-muted">Bạn đã xem hết thông báo.</div>}
          {shown.map((n) => (
            <Link key={n.id} href={n.link || "/notifications"} role="menuitem" className="notif-item" data-unread={!n.read}
              onClick={() => { setOpen(false); if (!n.read) mentoringApi.markRead(n.id).then(onChanged).catch(() => {}); }}>
              <span className="notif-icon">{notifIcon(n.type)}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-small">{n.title}</b>
                <span className="mt-0.5 block text-small text-ink-muted">{n.message}</span>
                <span className="mt-0.5 block text-[11px] text-ink-subtle tabular">{formatDateTime(n.createdAt)}</span>
              </span>
              {!n.read && <span className="notif-dot" aria-label="Chưa đọc" />}
            </Link>
          ))}
          <Link href="/notifications" className="pop-foot" onClick={() => setOpen(false)}>Xem tất cả thông báo</Link>
        </div>
      )}
    </div>
  );
}

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Sáng" },
  { id: "dark", label: "Tối" },
  { id: "system", label: "Tự động" },
];

function row(href: string, label: string, icon: ReactNode, onClick: () => void, extra?: ReactNode) {
  return (
    <Link key={href} href={href} role="menuitem" className="acct-item" onClick={onClick}>
      <span>{icon}{label}</span>
      {extra}
    </Link>
  );
}

const STATUS_OPTIONS: { id: Exclude<MentorStatus, "SUSPENDED">; label: string }[] = [
  { id: "ACCEPTING", label: "Đang nhận" },
  { id: "PAUSED", label: "Tạm dừng" },
  { id: "ON_LEAVE", label: "Nghỉ phép" },
];

/** Thông tin riêng của mentor trong menu: công tắc nhận mentee, có thể rút, hồ sơ hoàn thiện. */
function useMentorMenu(user: SessionUser, open: boolean) {
  const mentor = user.role === "MENTOR";
  const [status, setStatus] = useState<MentorStatus | null>(null);
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !mentor) return;
    profileApi.getMentor(user.userId).then((p) => { setStatus(p.status); setCompleteness(p.completeness); }).catch(() => {});
    paymentApi.payoutOverview().then((o) => setAvailable(o.available)).catch(() => setAvailable(null));
  }, [open, mentor, user.userId]);
  const change = async (next: Exclude<MentorStatus, "SUSPENDED">) => {
    if (next === status || busy) return;
    setErr("");
    let until: string | null = null;
    if (next === "ON_LEAVE") {
      const d = new Date(Date.now() + 7 * 86400000);
      until = d.toISOString().slice(0, 10); // mặc định nghỉ 7 ngày; chỉnh ngày ở trang hồ sơ
    }
    setBusy(true);
    try {
      const p = await profileApi.changeStatus(user.userId, { status: next, onLeaveUntil: until });
      setStatus(p.status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không đổi được trạng thái.");
    } finally {
      setBusy(false);
    }
  };
  return { status, completeness, available, err, busy, change };
}

function MentorStatusSwitch({ m }: { m: ReturnType<typeof useMentorMenu> }) {
  return (
    <div className="acct-status">
      <span className="text-[11px] text-ink-subtle">Trạng thái nhận mentee</span>
      <div className="seg" role="radiogroup" aria-label="Trạng thái nhận mentee">
        {STATUS_OPTIONS.map(({ id, label }) => (
          <button key={id} type="button" role="radio" aria-checked={m.status === id} disabled={m.busy || m.status === null || m.status === "SUSPENDED"} onClick={() => m.change(id)}>{label}</button>
        ))}
      </div>
      {m.status === "ON_LEAVE" && <span className="text-[11px] text-ink-muted">Nghỉ phép 7 ngày; chỉnh ngày ở Quản lý hồ sơ.</span>}
      {m.err && <span role="alert" className="text-[11px] text-danger">{m.err}</span>}
    </div>
  );
}

function MentorExtras({ m, onClose }: { m: ReturnType<typeof useMentorMenu>; onClose: () => void }) {
  const score = m.completeness?.score;
  return (
    <>
      <MentorStatusSwitch m={m} />
      <div className="acct-wallet">
        <span><span className="block text-[11px] text-ink-subtle">Có thể rút</span><b className="text-title-2 tabular">{m.available === null ? "…" : formatVnd(m.available)}</b></span>
        <Link href="/earnings" className="btn btn-sm" onClick={onClose}>Doanh thu</Link>
      </div>
      {score != null && (
        <Link href="/profile" className="acct-complete" onClick={onClose} aria-label={`Hồ sơ hoàn thiện ${score}%`}>
          <span className="flex items-center justify-between text-small"><b>Hồ sơ hoàn thiện {score}%</b>{score < 100 && <span className="font-semibold text-accent-ink">Bổ sung &rarr;</span>}</span>
          <span className="acct-bar" aria-hidden="true"><i style={{ width: `${score}%` }} /></span>
        </Link>
      )}
    </>
  );
}

/** Menu tài khoản (ảnh đại diện): thông tin, số dư ví hoặc doanh thu, liên kết theo vai trò, giao diện, đăng xuất. */
export function AccountMenu({ user }: { user: SessionUser }) {
  const { logout } = useAuth();
  const router = useRouter();
  const { open, setOpen, ref } = usePopover();
  const [theme, setTheme] = useTheme();
  const [cash, setCash] = useState<number | null>(null);
  const name = user.fullName || user.email;
  const close = useCallback(() => setOpen(false), [setOpen]);
  const mentorMenu = useMentorMenu(user, open);

  useEffect(() => {
    if (!open || user.role !== "MENTEE") return;
    paymentApi.wallet().then((w) => setCash(w.cash + w.promo)).catch(() => setCash(null));
  }, [open, user.role]);

  const selfHref = user.role === "MENTOR" ? `/mentors/${user.userId}` : user.role === "MENTEE" ? "/profile" : "/account";
  const ico = (I: typeof Bell) => <I aria-hidden="true" />;

  return (
    <div className="pop-anchor" ref={ref}>
      <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Tài khoản của ${name}`} onClick={() => setOpen((v) => !v)}>
        <Avatar name={name} size="sm" />
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="popover acct" role="menu" aria-label="Tài khoản">
          <Link href={selfHref} role="menuitem" className="acct-head" onClick={close}>
            <Avatar name={name} size="lg" />
            <span className="min-w-0 flex-1">
              <b className="block truncate">{name}</b>
              <span className="block truncate text-small text-ink-muted">{user.email}</span>
              <span className="badge badge-plain badge-accent mt-1">{ROLE_LABELS[user.role]}</span>
            </span>
            <span className="text-small font-semibold text-accent-ink">Xem trang<br />cá nhân</span>
          </Link>
          {user.role === "MENTEE" && (
            <div className="acct-wallet">
              <span><span className="block text-[11px] text-ink-subtle">Số dư ví</span><b className="text-title-2 tabular">{cash === null ? "…" : formatVnd(cash)}</b></span>
              <Link href="/wallet" className="btn btn-primary btn-sm" onClick={close}>Nạp thêm</Link>
            </div>
          )}
          {user.role === "MENTOR" && <MentorExtras m={mentorMenu} onClose={close} />}
          <div className="acct-list">
            {user.role === "ADMIN" ? (
              <>
                {row("/admin/audit", "Nhật ký của tôi", ico(ClipboardList), close)}
                {row("/account", "Tài khoản và bảo mật", ico(ShieldCheck), close)}
              </>
            ) : (
              <>
                {row("/profile", user.role === "MENTOR" ? "Quản lý hồ sơ và lịch rảnh" : "Quản lý hồ sơ", ico(UserRound), close)}
                {user.role === "MENTOR" && row("/interview", "Xác thực năng lực", ico(ShieldCheck), close)}
                {user.role === "MENTOR" && row("/profile/domains", "Lĩnh vực của tôi", ico(Library), close)}
                {row("/blog/me", "Bài viết của tôi", ico(BookOpen), close)}
                {user.role === "MENTEE" && row("/cv-enrichment", "CV của tôi", ico(FileText), close)}
                {row("/referral", "Giới thiệu bạn bè", ico(Gift), close)}
                {user.role === "MENTOR" && row("/payment/transactions", "Giao dịch", ico(Banknote), close)}
                {row("/account", "Tài khoản và bảo mật", ico(ShieldCheck), close)}
              </>
            )}
          </div>
          <div className="acct-foot">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-small text-ink-muted">Giao diện</span>
              <div className="seg" role="radiogroup" aria-label="Giao diện">
                {THEMES.map(({ id, label }) => (
                  <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => setTheme(id)}>{label}</button>
                ))}
              </div>
            </div>
            <button type="button" role="menuitem" className="acct-item is-danger w-full" onClick={async () => { await logout(); router.push("/"); }}>
              <span><LogOut aria-hidden="true" />Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export interface DrawerLink { href: string; label: string }

/** Nội dung ngăn menu bên phải trên điện thoại: hồ sơ, ví, điều hướng, tài khoản, giao diện, đăng xuất. */
export function DrawerBody({ user, nav, current, onClose }: { user: SessionUser; nav: DrawerLink[]; current?: string; onClose: () => void }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const [cash, setCash] = useState<number | null>(null);
  const name = user.fullName || user.email;
  const mentee = user.role === "MENTEE";
  const mentor = user.role === "MENTOR";
  const selfHref = mentor ? `/mentors/${user.userId}` : "/profile";
  const mentorMenu = useMentorMenu(user, true);

  useEffect(() => {
    if (!mentee) return;
    paymentApi.wallet().then((w) => setCash(w.cash + w.promo)).catch(() => setCash(null));
  }, [mentee]);

  const account: DrawerLink[] = [
    { href: "/profile", label: mentor ? "Quản lý hồ sơ và lịch rảnh" : "Quản lý hồ sơ" },
    ...(mentor ? [{ href: "/interview", label: "Xác thực năng lực" }, { href: "/profile/domains", label: "Lĩnh vực của tôi" }] : []),
    { href: "/blog/me", label: "Bài viết của tôi" },
    ...(mentee ? [{ href: "/cv-enrichment", label: "CV của tôi" }] : []),
    { href: "/referral", label: "Giới thiệu bạn bè" },
    ...(mentor ? [{ href: "/payment/transactions", label: "Giao dịch" }] : []),
    { href: "/account", label: "Tài khoản và bảo mật" },
  ];

  return (
    <>
      <div className="drawer-head">
        <b>Menu</b>
        <button type="button" className="icon-btn" aria-label="Đóng menu" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <Link href={selfHref} className="drawer-profile" onClick={onClose}>
        <Avatar name={name} size="lg" />
        <span className="min-w-0 flex-1">
          <b className="block truncate">{name}</b>
          <span className="block text-small font-semibold text-accent-ink">Xem trang cá nhân &rarr;</span>
        </span>
      </Link>
      {mentee && (
        <div className="acct-wallet">
          <span><span className="block text-[11px] text-ink-muted">Số dư ví</span><b className="text-title-2 tabular">{cash === null ? "…" : formatVnd(cash)}</b></span>
          <Link href="/wallet" className="btn btn-primary btn-sm" onClick={onClose}>Nạp thêm</Link>
        </div>
      )}
      {mentor && <MentorExtras m={mentorMenu} onClose={onClose} />}
      <nav className="drawer-group" aria-label="Điều hướng">
        <div className="drawer-label">Điều hướng</div>
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="drawer-link" aria-current={current === item.href ? "page" : undefined} onClick={onClose}>{item.label}</Link>
        ))}
        <div className="drawer-label">Tài khoản</div>
        {account.map((item) => (
          <Link key={item.href} href={item.href} className="drawer-link" onClick={onClose}>{item.label}</Link>
        ))}
      </nav>
      <div className="drawer-theme">
        <span className="text-small text-ink-muted">Giao diện</span>
        <div className="seg" role="radiogroup" aria-label="Giao diện">
          {THEMES.map(({ id, label }) => (
            <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => setTheme(id)}>{label}</button>
          ))}
        </div>
      </div>
      <button type="button" className="drawer-logout" onClick={async () => { await logout(); router.push("/"); }}>
        <LogOut aria-hidden="true" />Đăng xuất
      </button>
    </>
  );
}
