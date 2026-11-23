import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Flag,
  Gift,
  GraduationCap,
  Handshake,
  Inbox,
  LayoutDashboard,
  Mic,
  PenLine,
  Library,
  MessageSquare,
  PhoneOff,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Số đếm hiển thị cạnh mục (vd. tin nhắn chưa đọc). */
  badge?: "messages" | "verification" | "disputes" | "payouts" | "reports";
  /** Đường dẫn khác cũng tính là mục này (vd. "Tìm mentor" gồm cả /mentors). */
  also?: string[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const MENTORING: NavGroup = {
  label: "Mentoring",
  items: [
    { href: "/mentoring/requests", label: "Yêu cầu", icon: Inbox },
    { href: "/mentoring/relationships", label: "Quan hệ mentoring", icon: Handshake },
    { href: "/mentoring/sessions", label: "Phiên học", icon: CalendarDays },
    { href: "/messages", label: "Tin nhắn", icon: MessageSquare, badge: "messages" },
  ],
};

export const NAV: Record<Role, NavGroup[]> = {
  MENTEE: [
    {
      items: [
        { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
        { href: "/matching", label: "Tìm mentor", icon: Sparkles, also: ["/mentors"] },
      ],
    },
    MENTORING,
    {
      label: "Phát triển",
      items: [
        { href: "/profile", label: "Hồ sơ", icon: UserRound },
        { href: "/cv-enrichment", label: "CV & mục tiêu", icon: FileText },
        { href: "/mock-interviews", label: "Phỏng vấn thử", icon: Mic },
        { href: "/blog", label: "Blog", icon: PenLine, also: ["/blog/write", "/blog/me"] },
      ],
    },
  ],
  MENTOR: [
    { items: [{ href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard }] },
    MENTORING,
    {
      label: "Thu nhập",
      items: [
        { href: "/earnings", label: "Thu nhập", icon: Wallet },
        { href: "/payment/transactions", label: "Giao dịch", icon: Receipt },
      ],
    },
    {
      label: "Hồ sơ mentor",
      items: [
        { href: "/profile", label: "Hồ sơ", icon: UserRound },
        { href: "/interview", label: "Xác thực năng lực", icon: BadgeCheck },
        { href: "/profile/domains", label: "Lĩnh vực của tôi", icon: Library },
        { href: "/blog", label: "Blog", icon: PenLine, also: ["/blog/write", "/blog/me"] },
      ],
    },
  ],
  ADMIN: [
    { items: [{ href: "/admin", label: "Tổng quan", icon: LayoutDashboard }] },
    {
      label: "Người dùng",
      items: [
        { href: "/admin/users", label: "Tài khoản", icon: Users },
        { href: "/admin/verification", label: "Duyệt mentor", icon: ShieldCheck, badge: "verification" },
        { href: "/admin/mentors", label: "Mentor", icon: GraduationCap },
      ],
    },
    {
      label: "Tài chính",
      items: [
        { href: "/admin/transactions", label: "Giao dịch", icon: Receipt },
        { href: "/admin/payouts", label: "Rút tiền", icon: Banknote, badge: "payouts" },
        { href: "/admin/wallet", label: "Ví người dùng", icon: Wallet },
      ],
    },
    {
      label: "Kiểm duyệt",
      items: [
        { href: "/admin/disputes", label: "Tranh chấp", icon: Scale, badge: "disputes" },
        { href: "/admin/message-reports", label: "Báo cáo tin nhắn", icon: Flag, badge: "reports" },
        { href: "/admin/contact-violations", label: "Chia sẻ liên hệ", icon: PhoneOff },
        { href: "/admin/blog", label: "Kiểm duyệt blog", icon: Flag },
        { href: "/admin/audit", label: "Nhật ký", icon: ClipboardList },
      ],
    },
  ],
};

/** Mục ít dùng, đặt trong menu tài khoản thay vì sidebar. */
export const ACCOUNT_LINKS: Record<Role, NavItem[]> = {
  MENTEE: [
    { href: "/wallet", label: "Ví", icon: Wallet },
    { href: "/payment/transactions", label: "Giao dịch", icon: Receipt },
    { href: "/referral", label: "Giới thiệu bạn bè", icon: Gift },
  ],
  MENTOR: [{ href: "/referral", label: "Giới thiệu bạn bè", icon: Gift }],
  ADMIN: [],
};

/** Mục nav khớp đường dẫn hiện tại (khớp dài nhất; trang chủ của vai trò chỉ khớp chính xác). */
export function activeItem(role: Role, pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const group of NAV[role]) {
    for (const item of group.items) {
      const exactOnly = item.href === "/admin" || item.href === "/dashboard";
      const hit = exactOnly ? pathname === item.href
        : [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));
      if (hit && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best;
}

/** Điều hướng ngang trên cùng cho mentee và mentor (quản trị viên dùng thanh bên NAV.ADMIN). */
export const TOP_NAV: Record<"MENTEE" | "MENTOR", { href: string; label: string; also?: string[] }[]> = {
  MENTEE: [
    { href: "/dashboard", label: "Tiến độ" },
    { href: "/matching", label: "Tìm mentor", also: ["/mentors"] },
    { href: "/mentoring/requests", label: "Yêu cầu" },
    { href: "/mentoring/sessions", label: "Phiên học", also: ["/mentoring/relationships", "/payment"] },
    { href: "/blog", label: "Blog", also: ["/blog/write", "/blog/me"] },
  ],
  MENTOR: [
    { href: "/dashboard", label: "Tổng quan" },
    { href: "/mentoring/requests", label: "Yêu cầu" },
    { href: "/mentoring/sessions", label: "Phiên học", also: ["/mentoring/relationships"] },
    { href: "/earnings", label: "Thu nhập", also: ["/payment/transactions"] },
    { href: "/blog", label: "Blog", also: ["/blog/write", "/blog/me"] },
  ],
};

export function activeTop(role: "MENTEE" | "MENTOR", pathname: string): string | undefined {
  let best: { href: string } | undefined;
  for (const item of TOP_NAV[role]) {
    const hit = item.href === "/dashboard" ? pathname === item.href
      : [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.href;
}

/** Biểu tượng cho thanh tab dưới cùng trên điện thoại (theo href của TOP_NAV). */
export const TAB_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/matching": Sparkles,
  "/mentoring/requests": Inbox,
  "/mentoring/sessions": CalendarDays,
  "/earnings": Wallet,
  "/blog": PenLine,
  "/messages": MessageSquare,
};

/** Thanh tab dưới cùng: các mục TOP_NAV (trừ Blog, nằm trong ngăn menu) cộng Tin nhắn. */
export function mobileTabs(role: "MENTEE" | "MENTOR"): { href: string; label: string; badge?: "messages" }[] {
  return [
    ...TOP_NAV[role].filter((i) => i.href !== "/blog"),
    { href: "/messages", label: "Tin nhắn", badge: "messages" as const },
  ];
}
