import { api, apiBlob } from "@/lib/api";
import type {
  AttendanceAnswer,
  ActionItem,
  ActionItemInput,
  ActionItemUpdate,
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
  MenteeReliability,
  MentorReviewSummary,
  StructuredReviewInput,
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
  SessionNotes,
  SessionStatus,
  SharedNote,
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
  // US-41 — đánh giá có cấu trúc (sửa trong 48 giờ), phản hồi của mentor, nhận xét riêng về mentee
  review: (id: Uuid, body: StructuredReviewInput) => api<Review>(`/api/mentoring/sessions/${id}/review`, { method: "POST", body }),
  updateReview: (id: Uuid, body: StructuredReviewInput) =>
    api<Review>(`/api/mentoring/sessions/${id}/review`, { method: "PUT", body }),
  replyReview: (reviewId: Uuid, reply: string) =>
    api<Review>(`/api/mentoring/reviews/${reviewId}/reply`, { method: "POST", body: { reply } }),
  mentorReviews: (mentorId: Uuid) => api<Review[]>(`/api/mentoring/mentors/${mentorId}/reviews`),
  reviewSummary: (mentorId: Uuid) => api<MentorReviewSummary>(`/api/mentoring/mentors/${mentorId}/review-summary`),
  menteeFeedback: (sessionId: Uuid, preparation: number, engagement: number, comment?: string) =>
    api<MenteeReliability>(`/api/mentoring/sessions/${sessionId}/mentee-feedback`, {
      method: "POST", body: { preparation, engagement, comment },
    }),
  menteeReliability: (menteeId: Uuid) => api<MenteeReliability>(`/api/mentoring/mentees/${menteeId}/reliability`),
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
  /** US-34 — tải file .ics "Thêm vào lịch" (tải lại sau khi dời lịch sẽ cập nhật sự kiện cũ). */
  downloadCalendar: async (sessionId: Uuid) => {
    const blob = await apiBlob(`/api/mentoring/sessions/${sessionId}/calendar.ics`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mentoring-${sessionId.slice(0, 8)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  // Ghi chú phiên (US-40)
  sessionNotes: (sessionId: Uuid) => api<SessionNotes>(`/api/mentoring/sessions/${sessionId}/notes`),
  saveSharedNote: (sessionId: Uuid, content: string, baseVersion: number) =>
    api<SharedNote>(`/api/mentoring/sessions/${sessionId}/notes`, { method: "PUT", body: { content, baseVersion } }),
  savePrivateNote: (sessionId: Uuid, content: string) =>
    api<{ content: string; updatedAt: string | null }>(`/api/mentoring/sessions/${sessionId}/private-note`, { method: "PUT", body: { content } }),
  addActionItem: (sessionId: Uuid, body: ActionItemInput) =>
    api<ActionItem>(`/api/mentoring/sessions/${sessionId}/action-items`, { method: "POST", body }),
  updateActionItem: (itemId: Uuid, body: ActionItemUpdate) =>
    api<ActionItem>(`/api/mentoring/action-items/${itemId}`, { method: "PATCH", body }),
  deleteActionItem: (itemId: Uuid) => api<null>(`/api/mentoring/action-items/${itemId}`, { method: "DELETE" }),
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
