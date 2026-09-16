import { api } from "@/lib/api";

// auth-service (Quang)
export const authApi = {
  verifyEmail: (token) => api(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false }),
  me: () => api("/api/auth/me"),
  updateMe: (fullName) => api("/api/auth/me", { method: "PUT", body: { fullName } }),
  changePassword: (currentPassword, newPassword) =>
    api("/api/auth/me/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  adminListUsers: ({ role = "", q = "", page = 0 } = {}) =>
    api(`/api/auth/admin/users?role=${role}&q=${encodeURIComponent(q)}&page=${page}&size=20`),
  adminStats: () => api("/api/auth/admin/users/stats"),
  adminSetStatus: (userId, status) => api(`/api/auth/admin/users/${userId}/status`, { method: "PATCH", body: { status } }),
};
