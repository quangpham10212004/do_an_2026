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
