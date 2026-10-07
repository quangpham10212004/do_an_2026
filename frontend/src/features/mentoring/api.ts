import { api } from "@/lib/api";
import type {
  AvailableSlots,
  BookSessionInput,
  CancelPreview,
  RescheduleProposal,
  LegacyBookSessionInput,
  MentoringRequest,
  MentoringSession,
  MentoringStats,
  NotificationList,
  Review,
  SessionStatus,
  Uuid,
} from "@/types";

// mentoring-service (Thắng) — các tính năng AI nằm ở ai-service, xem features/ai/api.ts
export const mentoringApi = {
  // Yêu cầu mentoring
  requests: () => api<MentoringRequest[]>("/api/mentoring/requests"),
  createRequest: (mentorId: Uuid, message: string) =>
    api<MentoringRequest>("/api/mentoring/requests", { method: "POST", body: { mentorId, message } }),
  respond: (id: Uuid, decision: "ACCEPT" | "REJECT", note: string) =>
    api<MentoringRequest>(`/api/mentoring/requests/${id}/respond`, { method: "POST", body: { decision, note } }),
  cancelRequest: (id: Uuid) => api<MentoringRequest>(`/api/mentoring/requests/${id}/cancel`, { method: "POST" }),
  completeRequest: (id: Uuid) => api<MentoringRequest>(`/api/mentoring/requests/${id}/complete`, { method: "POST" }),
  // Phiên mentoring
  sessions: (status: SessionStatus | "" = "") => api<MentoringSession[]>(`/api/mentoring/sessions?status=${status}`),
  session: (id: Uuid) => api<MentoringSession>(`/api/mentoring/sessions/${id}`),
  bookSession: (body: BookSessionInput) => api<MentoringSession>("/api/mentoring/sessions", { method: "POST", body }),
  /** @deprecated thiếu sessionType/agenda (US-03) — dùng bookSession hoặc chuyển tới /mentoring/book/{mentorId}. */
  book: (body: LegacyBookSessionInput) => api<MentoringSession>("/api/mentoring/sessions", { method: "POST", body }),
  cancelPreview: (id: Uuid) => api<CancelPreview>(`/api/mentoring/sessions/${id}/cancel-preview`),
  cancelSession: (id: Uuid, reason: string) =>
    api<MentoringSession>(`/api/mentoring/sessions/${id}/cancel`, { method: "POST", body: { reason } }),
  updateMeetingLink: (id: Uuid, meetingLink: string) =>
    api<MentoringSession>(`/api/mentoring/sessions/${id}/meeting-link`, { method: "PUT", body: { meetingLink } }),
  completeSession: (id: Uuid) => api<MentoringSession>(`/api/mentoring/sessions/${id}/complete`, { method: "POST" }),
  review: (id: Uuid, rating: number, comment: string) =>
    api<Review>(`/api/mentoring/sessions/${id}/review`, { method: "POST", body: { rating, comment } }),
  mentorReviews: (mentorId: Uuid) => api<Review[]>(`/api/mentoring/mentors/${mentorId}/reviews`),
  availableSlots: (mentorId: Uuid, durationMinutes = 60, days = 14, excludeSessionId?: Uuid) =>
    api<AvailableSlots>(`/api/mentoring/mentors/${mentorId}/available-slots?durationMinutes=${durationMinutes}&days=${days}`
      + (excludeSessionId ? `&excludeSessionId=${excludeSessionId}` : "")),
  // Dời lịch (US-06)
  proposeReschedule: (sessionId: Uuid, newStart: string) =>
    api<RescheduleProposal>(`/api/mentoring/sessions/${sessionId}/reschedule`, { method: "POST", body: { newStart } }),
  acceptReschedule: (proposalId: Uuid) => api<MentoringSession>(`/api/mentoring/reschedules/${proposalId}/accept`, { method: "POST" }),
  declineReschedule: (proposalId: Uuid) =>
    api<RescheduleProposal>(`/api/mentoring/reschedules/${proposalId}/decline`, { method: "POST" }),
  // Thông báo
  notifications: (limit = 50) => api<NotificationList>(`/api/mentoring/notifications?limit=${limit}`),
  markRead: (id: Uuid) => api<null>(`/api/mentoring/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api<null>("/api/mentoring/notifications/read-all", { method: "POST" }),
  // Admin — thống kê phiên mentoring (số liệu AI Interview lấy từ aiApi.adminStats)
  adminStats: () => api<MentoringStats>("/api/mentoring/admin/stats"),
};
