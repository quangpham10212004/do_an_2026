import { api } from "@/lib/api";

// mentoring-service (Thắng) — các tính năng AI nằm ở ai-service, xem features/ai/api.js
export const mentoringApi = {
  // Yêu cầu mentoring
  requests: () => api("/api/mentoring/requests"),
  createRequest: (mentorId, message) => api("/api/mentoring/requests", { method: "POST", body: { mentorId, message } }),
  respond: (id, decision, note) => api(`/api/mentoring/requests/${id}/respond`, { method: "POST", body: { decision, note } }),
  cancelRequest: (id) => api(`/api/mentoring/requests/${id}/cancel`, { method: "POST" }),
  completeRequest: (id) => api(`/api/mentoring/requests/${id}/complete`, { method: "POST" }),
  // Phiên mentoring
  sessions: (status = "") => api(`/api/mentoring/sessions?status=${status}`),
  session: (id) => api(`/api/mentoring/sessions/${id}`),
  book: (body) => api("/api/mentoring/sessions", { method: "POST", body }),
  cancelSession: (id, reason) => api(`/api/mentoring/sessions/${id}/cancel`, { method: "POST", body: { reason } }),
  completeSession: (id) => api(`/api/mentoring/sessions/${id}/complete`, { method: "POST" }),
  review: (id, rating, comment) => api(`/api/mentoring/sessions/${id}/review`, { method: "POST", body: { rating, comment } }),
  mentorReviews: (mentorId) => api(`/api/mentoring/mentors/${mentorId}/reviews`),
  availableSlots: (mentorId, durationMinutes = 60, days = 14) =>
    api(`/api/mentoring/mentors/${mentorId}/available-slots?durationMinutes=${durationMinutes}&days=${days}`),
  // Thông báo
  notifications: (limit = 50) => api(`/api/mentoring/notifications?limit=${limit}`),
  markRead: (id) => api(`/api/mentoring/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api("/api/mentoring/notifications/read-all", { method: "POST" }),
  // Admin — thống kê phiên mentoring (số liệu AI Interview lấy từ aiApi.adminStats)
  adminStats: () => api("/api/mentoring/admin/stats"),
};
