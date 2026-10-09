import { api } from "@/lib/api";
import type { AccountStatus, AuditEntry, PageResponse, Role, User, UserStats, Uuid } from "@/types";

export interface UserFilters {
  role?: Role | "";
  q?: string;
  page?: number;
}

/** US-30: bộ lọc nhật ký kiểm toán; chuỗi rỗng = không lọc. from/to dạng yyyy-MM-dd (giờ Việt Nam). */
export interface AuditFilters {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
  page: number;
}

/** US-38 (PRD-NOTI-1, NOTI-4) — tuỳ chọn email theo nhóm + giờ yên tĩnh 22:00–07:00. */
export interface NotificationPreferences {
  requests: boolean;
  sessions: boolean;
  messages: boolean;
  reviews: boolean;
  marketing: boolean;
  quietHours: boolean;
  quietStart?: string;
  quietEnd?: string;
}

// auth-service (Quang)
export const authApi = {
  /** US-39 — gửi lại email xác thực (tối đa 3 lần / giờ → 429 RESEND_LIMIT). emailVerificationToken chỉ có ở môi trường demo. */
  resendVerification: () =>
    api<{ sent: boolean; emailVerificationToken: string | null }>("/api/auth/me/resend-verification", { method: "POST" }),
  notificationPreferences: () => api<NotificationPreferences>("/api/auth/me/notification-preferences"),
  saveNotificationPreferences: (body: NotificationPreferences) =>
    api<NotificationPreferences>("/api/auth/me/notification-preferences", { method: "PUT", body }),
  verifyEmail: (token: string) => api<User>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false }),
  // US-09 — luôn 202 (null), không tiết lộ email có tồn tại hay không
  forgotPassword: (email: string) => api<null>("/api/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  // 204 (null); 400 RESET_TOKEN_INVALID khi token sai / hết hạn / đã dùng
  resetPassword: (token: string, newPassword: string) =>
    api<null>("/api/auth/reset-password", { method: "POST", body: { token, newPassword }, auth: false }),
  me: () => api<User>("/api/auth/me"),
  updateMe: (fullName: string) => api<User>("/api/auth/me", { method: "PUT", body: { fullName } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<null>("/api/auth/me/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  adminListUsers: ({ role = "", q = "", page = 0 }: UserFilters = {}) =>
    api<PageResponse<User>>(`/api/auth/admin/users?role=${role}&q=${encodeURIComponent(q)}&page=${page}&size=20`),
  adminStats: () => api<UserStats>("/api/auth/admin/users/stats"),
  adminAudit: ({ page, ...filters }: AuditFilters) => {
    const query = new URLSearchParams({ page: String(page), size: "20" });
    Object.entries(filters).forEach(([k, v]) => v.trim() && query.set(k, v.trim()));
    return api<PageResponse<AuditEntry>>(`/api/auth/admin/audit?${query.toString()}`);
  },
  adminSetStatus: (userId: Uuid, status: AccountStatus) =>
    api<User>(`/api/auth/admin/users/${userId}/status`, { method: "PATCH", body: { status } }),
};
