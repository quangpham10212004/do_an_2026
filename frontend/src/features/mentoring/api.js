import { api } from "@/lib/api";

// mentoring-service (Thắng) — các tính năng AI nằm ở ai-service, xem features/ai/api.js
export const mentoringApi = {
  // Yêu cầu mentoring
  requests: () => api("/api/mentoring/requests"),
  createRequest: (mentorId, message) => api("/api/mentoring/requests", { method: "POST", body: { mentorId, message } }),
  // decision: ACCEPT (nhận thẳng) | INTRO (đồng ý làm quen trước) | REJECT
  respond: (id, decision, note) => api(`/api/mentoring/requests/${id}/respond`, { method: "POST", body: { decision, note } }),
  cancelRequest: (id) => api(`/api/mentoring/requests/${id}/cancel`, { method: "POST" }),
  completeRequest: (id) => api(`/api/mentoring/requests/${id}/complete`, { method: "POST" }),
  // Buổi làm quen: mentee đặt buổi, sau đó mỗi bên chọn CONTINUE | DECLINE
  bookIntro: (requestId, scheduledAt) => api(`/api/mentoring/requests/${requestId}/intro-session`, { method: "POST", body: { scheduledAt } }),
  decide: (requestId, decision) => api(`/api/mentoring/requests/${requestId}/decision`, { method: "POST", body: { decision } }),
  // Phiên mentoring
  sessions: (status = "") => api(`/api/mentoring/sessions?status=${status}`),
  session: (id) => api(`/api/mentoring/sessions/${id}`),
  book: (body) => api("/api/mentoring/sessions", { method: "POST", body }),
  cancelSession: (id, reason) => api(`/api/mentoring/sessions/${id}/cancel`, { method: "POST", body: { reason } }),
  completeSession: (id) => api(`/api/mentoring/sessions/${id}/complete`, { method: "POST" }),
  // Đổi lịch: áp dụng ngay nếu đủ điều kiện, ngược lại thành đề xuất; respondReschedule(accept=false) cũng dùng để rút đề xuất
  reschedule: (id, scheduledAt) => api(`/api/mentoring/sessions/${id}/reschedule`, { method: "POST", body: { scheduledAt } }),
  respondReschedule: (id, accept) => api(`/api/mentoring/sessions/${id}/reschedule/respond`, { method: "POST", body: { accept } }),
  review: (id, rating, comment) => api(`/api/mentoring/sessions/${id}/review`, { method: "POST", body: { rating, comment } }),
  mentorReviews: (mentorId) => api(`/api/mentoring/mentors/${mentorId}/reviews`),
  availableSlots: (mentorId, durationMinutes = 60, days = 14, excludeSessionId = "") =>
    api(`/api/mentoring/mentors/${mentorId}/available-slots?durationMinutes=${durationMinutes}&days=${days}${excludeSessionId ? `&excludeSessionId=${excludeSessionId}` : ""}`),
  // Gói buổi (combo)
  packageOptions: (mentorId, durationMinutes = 60) => api(`/api/mentoring/mentors/${mentorId}/package-options?durationMinutes=${durationMinutes}`),
  purchasePackage: (mentorId, sessions, durationMinutes = 60) =>
    api("/api/mentoring/packages", { method: "POST", body: { mentorId, sessions, durationMinutes } }),
  packages: () => api("/api/mentoring/packages"),
  cancelPackage: (id) => api(`/api/mentoring/packages/${id}/cancel`, { method: "POST" }),
  // Thông báo
  notifications: (limit = 50) => api(`/api/mentoring/notifications?limit=${limit}`),
  markRead: (id) => api(`/api/mentoring/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api("/api/mentoring/notifications/read-all", { method: "POST" }),
  // Admin — thống kê phiên mentoring (số liệu AI Interview lấy từ aiApi.adminStats)
  adminStats: () => api("/api/mentoring/admin/stats"),
};
