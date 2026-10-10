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
  Library,
  MessageSquare,
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
  badge?: "messages";
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
    { items: [{ href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard }] },
    {
      label: "Tìm mentor",
      items: [
        { href: "/matching", label: "AI Matching", icon: Sparkles },
        { href: "/mentors", label: "Danh sách mentor", icon: Users },
      ],
    },
    MENTORING,
    {
      label: "Phát triển",
      items: [
        { href: "/cv-enrichment", label: "CV & mục tiêu", icon: FileText },
        { href: "/learning", label: "Learning Hub", icon: BookOpen },
      ],
    },
    {
      label: "Tài khoản",
      items: [
        { href: "/profile", label: "Hồ sơ", icon: UserRound },
        { href: "/payment/transactions", label: "Giao dịch", icon: Receipt },
        { href: "/referral", label: "Giới thiệu bạn bè", icon: Gift },
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
        { href: "/interview", label: "AI Interview", icon: BadgeCheck },
        { href: "/learning", label: "Learning Hub", icon: BookOpen },
        { href: "/referral", label: "Giới thiệu bạn bè", icon: Gift },
      ],
    },
  ],
  ADMIN: [
    { items: [{ href: "/admin", label: "Tổng quan", icon: LayoutDashboard }] },
    {
      label: "Người dùng",
      items: [
        { href: "/admin/users", label: "Tài khoản", icon: Users },
        { href: "/admin/interviews", label: "Duyệt mentor", icon: ShieldCheck },
        { href: "/admin/mentors", label: "Mentor", icon: GraduationCap },
      ],
    },
    {
      label: "Tài chính",
      items: [
        { href: "/admin/transactions", label: "Giao dịch", icon: Receipt },
        { href: "/admin/payouts", label: "Rút tiền", icon: Banknote },
      ],
    },
    {
      label: "Kiểm duyệt",
      items: [
        { href: "/admin/disputes", label: "Tranh chấp", icon: Scale },
        { href: "/admin/message-reports", label: "Báo cáo tin nhắn", icon: Flag },
        { href: "/admin/learning", label: "Nội dung học", icon: Library },
        { href: "/admin/audit", label: "Nhật ký", icon: ClipboardList },
      ],
    },
  ],
};

/** Mục nav khớp đường dẫn hiện tại (khớp dài nhất; trang chủ của vai trò chỉ khớp chính xác). */
export function activeItem(role: Role, pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const group of NAV[role]) {
    for (const item of group.items) {
      const exactOnly = item.href === "/admin" || item.href === "/dashboard";
      const hit = exactOnly ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
      if (hit && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best;
}
