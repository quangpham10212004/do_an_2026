import { api } from "@/lib/api";
import type {
  AttendanceAnswer,
  AvailableSlots,
  ChatMessage,
  ConversationSummary,
  ConversationView,
  MessageReport,
  MessageReportOutcome,
  MessageReportReason,
  MessageReportStatus,
  BookSessionInput,
  CancelPreview,
  CreateRequestInput,
  EndReason,
  Dispute,
  DisputeStatus,
  OpenDisputeInput,
  ResolveDisputeInput,
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
  respond: (id: Uuid, decision: "ACCEPT" | "REJECT", note: string, rejectReason?: RejectReason) =>
    api<MentoringRequest>(`/api/mentoring/requests/${id}/respond`, { method: "POST", body: { decision, note, rejectReason } }),
  cancelRequest: (id: Uuid) => api<MentoringRequest>(`/api/mentoring/requests/${id}/cancel`, { method: "POST" }),
  /** @deprecated US-31 — dùng endRequest (có lý do). */
  completeRequest: (id: Uuid) => api<MentoringRequest>(`/api/mentoring/requests/${id}/complete`, { method: "POST" }),
  /** US-31 — kết thúc quan hệ mentoring; Team B dùng lại ở /mentoring/relationships/[id]. */
  endRequest: (id: Uuid, reason: Exclude<EndReason, "INACTIVE">, note?: string) =>
    api<MentoringRequest>(`/api/mentoring/requests/${id}/end`, { method: "POST", body: { reason, note } }),
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
  // Tranh chấp (US-32)
  openDispute: (sessionId: Uuid, body: OpenDisputeInput) =>
    api<Dispute>(`/api/mentoring/sessions/${sessionId}/disputes`, { method: "POST", body }),
  sessionDisputes: (sessionId: Uuid) => api<Dispute[]>(`/api/mentoring/sessions/${sessionId}/disputes`),
  /** status: OPEN | IN_REVIEW | RESOLVED | ACTIVE (OPEN + IN_REVIEW) | "" (tất cả). */
  adminDisputes: (status: DisputeStatus | "ACTIVE" | "" = "") => api<Dispute[]>(`/api/mentoring/admin/disputes?status=${status}`),
  adminDispute: (id: Uuid) => api<Dispute>(`/api/mentoring/admin/disputes/${id}`),
  startDisputeReview: (id: Uuid) => api<Dispute>(`/api/mentoring/admin/disputes/${id}/start-review`, { method: "POST" }),
  resolveDispute: (id: Uuid, body: ResolveDisputeInput) =>
    api<Dispute>(`/api/mentoring/admin/disputes/${id}/resolve`, { method: "POST", body }),
  // Nhắn tin (US-33)
  conversations: () => api<ConversationSummary[]>("/api/mentoring/conversations"),
  unreadMessages: () => api<{ unread: number }>("/api/mentoring/conversations/unread-count"),
  /** after = createdAt của tin cuối đã có (polling); mở luồng = đánh dấu đã đọc. */
  conversation: (id: Uuid, after?: string) =>
    api<ConversationView>(`/api/mentoring/conversations/${id}` + (after ? `?after=${encodeURIComponent(after)}` : "")),
  sendMessage: (id: Uuid, body: string) =>
    api<ChatMessage>(`/api/mentoring/conversations/${id}/messages`, { method: "POST", body: { body } }),
  reportMessage: (messageId: Uuid, reason: MessageReportReason, note?: string) =>
    api<MessageReport>(`/api/mentoring/messages/${messageId}/report`, { method: "POST", body: { reason, note } }),
  adminMessageReports: (status: MessageReportStatus | "" = "OPEN") =>
    api<MessageReport[]>(`/api/mentoring/admin/message-reports?status=${status}`),
  adminMessageReport: (id: Uuid) => api<MessageReport>(`/api/mentoring/admin/message-reports/${id}`),
  resolveMessageReport: (id: Uuid, outcome: MessageReportOutcome, note?: string) =>
    api<MessageReport>(`/api/mentoring/admin/message-reports/${id}/resolve`, { method: "POST", body: { outcome, note } }),
  // Thông báo
  notifications: (limit = 50) => api<NotificationList>(`/api/mentoring/notifications?limit=${limit}`),
  markRead: (id: Uuid) => api<null>(`/api/mentoring/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api<null>("/api/mentoring/notifications/read-all", { method: "POST" }),
  // Admin — thống kê phiên mentoring (số liệu AI Interview lấy từ aiApi.adminStats)
  adminStats: () => api<MentoringStats>("/api/mentoring/admin/stats"),
};
