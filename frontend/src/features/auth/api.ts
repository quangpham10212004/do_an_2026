import { api } from "@/lib/api";
import type { AccountStatus, PageResponse, Role, User, UserStats, Uuid } from "@/types";

export interface UserFilters {
  role?: Role | "";
  q?: string;
  page?: number;
}

// auth-service (Quang)
export const authApi = {
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
  adminSetStatus: (userId: Uuid, status: AccountStatus) =>
    api<User>(`/api/auth/admin/users/${userId}/status`, { method: "PATCH", body: { status } }),
};
