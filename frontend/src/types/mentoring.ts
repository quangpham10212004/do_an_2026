import type { IsoDateTime, Uuid } from "./common";
import type { SessionType } from "./profile";

// contracts/mentoring-service.yaml
/** US-15 — EXPIRED: mentor không phản hồi trong 72 giờ. US-31 — ENDED thay COMPLETED (COMPLETED chỉ còn ở dữ liệu cũ). */
export type RequestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "EXPIRED" | "ENDED";
/** US-31 — lý do kết thúc mentoring; INACTIVE chỉ hệ thống dùng. */
export type EndReason = "GOAL_REACHED" | "NO_LONGER_NEEDED" | "NOT_A_FIT" | "OTHER" | "INACTIVE";
/** US-12 — PENDING = chờ thanh toán; EXPIRED = quá hạn thanh toán; AWAITING_ATTENDANCE = chờ hai bên xác nhận tham dự. */
export type SessionStatus =
  | "PENDING"
  | "CONFIRMED"
  | "AWAITING_ATTENDANCE"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "NO_SHOW_MENTEE"
  | "NO_SHOW_MENTOR"
  | "DISPUTED";
/** US-12 — câu trả lời xác nhận tham dự. Mentee: HELD | MENTOR_NO_SHOW | CANCELLED_ON_CALL; mentor: HELD | MENTEE_NO_SHOW | CANCELLED_ON_CALL. */
export type AttendanceAnswer = "HELD" | "MENTOR_NO_SHOW" | "MENTEE_NO_SHOW" | "CANCELLED_ON_CALL";
export type AttendanceResolution =
  | "BOTH_HELD"
  | "HELD_ONE_SIDE"
  | "NO_ANSWER"
  | "MENTEE_NO_SHOW_REPORTED"
  | "MENTOR_NO_SHOW_REPORTED"
  | "CONFLICT"
  | "CANCELLED_ON_CALL"
  /** US-32 — phiên DISPUTED / chờ xác nhận thành COMPLETED do tranh chấp kết luận không hoàn tiền. */
  | "DISPUTE_RESOLVED";
/** US-03 — thời lượng phiên được phép (phút). */
export type SessionDuration = 30 | 45 | 60 | 90 | 120;

/** US-14 — tần suất mong muốn của quan hệ mentoring. */
export type RequestFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "ONE_OFF";
/** US-14 — thời gian dự kiến (tháng). */
export type ExpectedDurationMonths = 1 | 3 | 6;
/** US-14 — lý do mentor từ chối. */
export type RejectReason = "FULL" | "NOT_MY_EXPERTISE" | "SCHEDULE" | "OTHER";

/** US-14 — tóm tắt hồ sơ mentee hiển thị cho mentor (null khi mentee tự xem / không lấy được). */
export interface MenteeSummary {
  displayName: string;
  domain: string;
  currentLevel: string | null;
  goal: string;
  skills: string[];
}

export interface MentoringRequest {
  id: Uuid;
  menteeId: Uuid;
  menteeName: string;
  mentorId: Uuid;
  mentorName: string;
  message: string | null;
  goal: string;
  sessionType: SessionType | null;
  frequency: RequestFrequency;
  expectedDurationMonths: number;
  status: RequestStatus;
  rejectReason: RejectReason | null;
  responseNote: string | null;
  createdAt: IsoDateTime;
  respondedAt: IsoDateTime | null;
  /** US-15 — thời điểm hết hạn (status EXPIRED). */
  expiredAt: IsoDateTime | null;
  menteeProfile: MenteeSummary | null;
  /** US-31 — kết thúc mentoring. */
  endedBy: "MENTEE" | "MENTOR" | "ADMIN" | "SYSTEM" | null;
  endReason: EndReason | null;
  endNote: string | null;
  endedAt: IsoDateTime | null;
  /** US-31 — đã nhắc "Bạn có muốn tiếp tục?" (30 ngày không có phiên). */
  inactivityWarnedAt: IsoDateTime | null;
}

/** US-14 — POST /api/mentoring/requests */
export interface CreateRequestInput {
  mentorId: Uuid;
  goal: string;
  sessionType: SessionType;
  frequency: RequestFrequency;
  expectedDurationMonths: ExpectedDurationMonths;
  message?: string;
}

export interface MentoringSession {
  id: Uuid;
  requestId: Uuid;
  menteeId: Uuid;
  menteeName: string;
  mentorId: Uuid;
  mentorName: string;
  scheduledAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationMinutes: number;
  price: number;
  topic: string | null;
  sessionType: SessionType | null;
  agenda: string | null;
  preReadLink: string | null;
  /** US-04 — chỉ có giá trị khi phiên đã CONFIRMED (hoặc sau đó). */
  meetingLink: string | null;
  status: SessionStatus;
  cancelledBy: CancelActor | null;
  cancelReason: string | null;
  refundPercent: number | null;
  rescheduleCount: number;
  pendingReschedule: RescheduleProposal | null;
  menteeAttendance: AttendanceAnswer | null;
  mentorAttendance: AttendanceAnswer | null;
  /** endsAt + 48 giờ — hạn xác nhận tham dự. */
  attendanceDeadline: IsoDateTime;
  attendanceResolution: AttendanceResolution | null;
  reviewed: boolean;
  reviewRating: number | null;
  createdAt: IsoDateTime;
  /** US-32 — tranh chấp gần nhất của phiên. */
  dispute: DisputeBrief | null;
  /** US-37 (PRD-PROF-6) — múi giờ hai bên (giờ địa phương của bên kia khi rê chuột). */
  mentorTimezone?: string;
  menteeTimezone?: string;
}

// ---- US-32: tranh chấp ----
export type DisputeType = "NO_SHOW" | "QUALITY" | "BEHAVIOR" | "PAYMENT" | "OTHER";
export type DisputeStatus = "OPEN" | "IN_REVIEW" | "RESOLVED";
export type DisputeOutcome = "FULL_REFUND" | "PARTIAL_REFUND" | "NO_REFUND" | "WARNING" | "SUSPEND";

export interface DisputeBrief {
  id: Uuid;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  refundPercent: number | null;
}

export interface DisputeSessionSummary {
  id: Uuid;
  menteeId: Uuid;
  menteeName: string | null;
  mentorId: Uuid;
  mentorName: string | null;
  scheduledAt: IsoDateTime;
  endsAt: IsoDateTime;
  price: number;
  status: SessionStatus;
  menteeAttendance: AttendanceAnswer | null;
  mentorAttendance: AttendanceAnswer | null;
  refundPercent: number | null;
}

export interface Dispute {
  id: Uuid;
  sessionId: Uuid;
  openedBy: Uuid | null;
  openedByRole: "MENTEE" | "MENTOR" | "SYSTEM";
  openedByName: string | null;
  type: DisputeType;
  description: string;
  evidenceLinks: string[];
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  refundPercent: number | null;
  resolutionNote: string | null;
  resolvedBy: Uuid | null;
  createdAt: IsoDateTime;
  firstResponseAt: IsoDateTime | null;
  /** SLA — createdAt + 48 giờ. */
  firstResponseDueAt: IsoDateTime;
  overdue: boolean;
  resolvedAt: IsoDateTime | null;
  session: DisputeSessionSummary | null;
}

/** POST /api/mentoring/sessions/{id}/disputes */
export interface OpenDisputeInput {
  type: DisputeType;
  description: string;
  evidenceLinks: string[];
}

/** POST /api/mentoring/admin/disputes/{id}/resolve — refundPercent chỉ với PARTIAL_REFUND (1–99). */
export interface ResolveDisputeInput {
  outcome: DisputeOutcome;
  refundPercent?: number;
  note: string;
}

export interface BookSessionInput {
  menteeId: Uuid;
  mentorId: Uuid;
  scheduledAt: IsoDateTime;
  durationMinutes: SessionDuration;
  sessionType: SessionType;
  agenda: string;
  preReadLink?: string;
  topic?: string;
}

/**
 * @deprecated Dạng cũ (trước US-03) — mentoring-service nay bắt buộc sessionType + agenda nên request dạng
 * này bị từ chối 400. Chỉ giữ để trang chưa cập nhật vẫn biên dịch; dùng BookSessionInput / trang /mentoring/book.
 */
export interface LegacyBookSessionInput {
  menteeId: Uuid;
  mentorId: Uuid;
  scheduledAt: IsoDateTime;
  durationMinutes: number;
  topic?: string;
}

export type RescheduleStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

/** US-06 — đề xuất dời lịch. */
export interface RescheduleProposal {
  id: Uuid;
  sessionId: Uuid;
  proposedBy: Uuid;
  newStart: IsoDateTime;
  expiresAt: IsoDateTime;
  status: RescheduleStatus;
  createdAt: IsoDateTime;
}

export type CancelActor = "MENTEE" | "MENTOR" | "SYSTEM";

/** US-01 — GET /api/mentoring/sessions/{id}/cancel-preview */
export interface CancelPreview {
  cancelledBy: CancelActor;
  refundPercent: number;
  refundAmount: number;
  policyText: string;
  rewardPoints: number;
  lateFreeCancel: boolean;
}

export interface Review {
  id: Uuid;
  sessionId: Uuid;
  menteeId: Uuid;
  menteeName: string;
  mentorId: Uuid;
  rating: number;
  comment: string | null;
  createdAt: IsoDateTime;
  // US-41 (PRD-REV-1..3) — null ở đánh giá trước US-41
  knowledge?: number | null;
  clarity?: number | null;
  preparation?: number | null;
  tags?: string[];
  updatedAt?: IsoDateTime | null;
  editableUntil?: IsoDateTime;
  mentorReply?: string | null;
  mentorRepliedAt?: IsoDateTime | null;
  canEdit?: boolean;
  canReply?: boolean;
}

/** US-41 — đánh giá có cấu trúc. */
export interface StructuredReviewInput {
  rating: number;
  knowledge: number;
  clarity: number;
  preparation: number;
  comment?: string;
  tags: string[];
}

/** US-41 (PRD-REV-5) — rating = trung bình Bayes, chỉ có khi reviewCount ≥ 3. */
export interface MentorReviewSummary {
  mentorId: Uuid;
  reviewCount: number;
  newMentor: boolean;
  rating: number | null;
  knowledge: number | null;
  clarity: number | null;
  preparation: number | null;
  tags: Record<string, number>;
  reviews: Review[];
}

/** US-41 (PRD-REV-4) — huy hiệu tổng hợp từ nhận xét riêng của mentor. */
export interface MenteeReliability {
  menteeId: Uuid;
  feedbackCount: number;
  badge: "RELIABLE" | null;
}

export interface TimeSlot {
  startAt: IsoDateTime;
  endAt: IsoDateTime;
}

export interface AvailableSlots {
  timezone: string;
  durationMinutes: number;
  price: number;
  slots: TimeSlot[];
}

export interface Notification {
  id: Uuid;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: IsoDateTime;
}

export interface NotificationList {
  unreadCount: number;
  items: Notification[];
}

export interface MentoringStats {
  pendingSessions: number;
  confirmedSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  awaitingAttendanceSessions: number;
  expiredSessions: number;
  noShowMenteeSessions: number;
  noShowMentorSessions: number;
  disputedSessions: number;
}

// US-40 (PRD-SES-10..12) — ghi chú phiên
export type ActionItemOwner = "MENTEE" | "MENTOR";

export interface ActionItem {
  id: Uuid;
  sessionId: Uuid;
  text: string;
  owner: ActionItemOwner;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  createdBy: Uuid;
  createdAt: string;
  /** Việc còn mở từ phiên trước của cặp. */
  carriedOver: boolean;
  overdue: boolean;
}

export interface SharedNote {
  content: string;
  /** 0 = chưa ai lưu; gửi lại làm baseVersion. */
  version: number;
  updatedBy: Uuid | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface SessionNotes {
  sessionId: Uuid;
  shared: SharedNote;
  actionItems: ActionItem[];
  /** Chỉ mentor; mentee luôn null. */
  privateNote: { content: string; updatedAt: string | null } | null;
  editable: boolean;
  viewerRole: ActionItemOwner;
  maxActionItems: number;
}

export interface ActionItemInput {
  text: string;
  owner: ActionItemOwner;
  dueDate?: string | null;
}

export interface ActionItemUpdate {
  text?: string;
  owner?: ActionItemOwner;
  dueDate?: string;
  clearDueDate?: boolean;
  done?: boolean;
}
