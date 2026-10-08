import { api } from "@/lib/api";
import type {
  AttendanceAnswer,
  AvailableSlots,
  BookSessionInput,
  CancelPreview,
  CreateRequestInput,
  IntroDecision,
  RejectReason,
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
  /** US-14 — gửi yêu cầu theo form (trang /mentoring/request/{mentorId}). */
  sendRequest: (body: CreateRequestInput) => api<MentoringRequest>("/api/mentoring/requests", { method: "POST", body }),
  /**
   * @deprecated Dạng cũ (chỉ lời nhắn) — từ US-14 mentoring-service bắt buộc goal / sessionType / frequency /
   * expectedDurationMonths nên request này bị từ chối 400. Chuyển người dùng tới /mentoring/request/{mentorId}.
   */
  createRequest: (mentorId: Uuid, message: string) =>
    api<MentoringRequest>("/api/mentoring/requests", { method: "POST", body: { mentorId, message } }),
  /** US-14 — REJECT bắt buộc rejectReason. */
  respond: (id: Uuid, decision: "ACCEPT" | "REJECT" | "INTRO", note: string, rejectReason?: RejectReason) =>
    api<MentoringRequest>(`/api/mentoring/requests/${id}/respond`, { method: "POST", body: { decision, note, rejectReason } }),
  /** Buổi làm quen (request INTRO): khung giờ trống, đặt buổi, quyết định tiếp tục / dừng. */
  introSlots: (requestId: Uuid, days = 14) => api<AvailableSlots>(`/api/mentoring/requests/${requestId}/intro-slots?days=${days}`),
  bookIntro: (requestId: Uuid, scheduledAt: string, agenda?: string) =>
    api<MentoringSession>(`/api/mentoring/requests/${requestId}/intro-session`, { method: "POST", body: { scheduledAt, agenda } }),
  introDecision: (requestId: Uuid, decision: IntroDecision, note = "") =>
    api<MentoringRequest>(`/api/mentoring/requests/${requestId}/decision`, { method: "POST", body: { decision, note } }),
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
  /** US-12 — mentor đánh dấu đã diễn ra = trả lời HELD (chỉ trong 48 giờ sau giờ kết thúc). */
  completeSession: (id: Uuid) => api<MentoringSession>(`/api/mentoring/sessions/${id}/complete`, { method: "POST" }),
  /** US-12 — xác nhận tham dự sau phiên. */
  answerAttendance: (id: Uuid, answer: AttendanceAnswer) =>
    api<MentoringSession>(`/api/mentoring/sessions/${id}/attendance`, { method: "POST", body: { answer } }),
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
