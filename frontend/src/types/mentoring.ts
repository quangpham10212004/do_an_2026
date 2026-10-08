import type { IsoDateTime, Uuid } from "./common";
import type { SessionType } from "./profile";

// contracts/mentoring-service.yaml
/** US-15 — EXPIRED: mentor không phản hồi trong 72 giờ. INTRO: mentor mời làm quen trước (chưa chiếm sức chứa). */
export type RequestStatus = "PENDING" | "INTRO" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "EXPIRED";
/** Quyết định của mỗi bên sau buổi làm quen. */
export type IntroDecision = "CONTINUE" | "DECLINE";
/** REGULAR = phiên có phí; INTRO = buổi làm quen miễn phí. */
export type SessionKind = "REGULAR" | "INTRO";
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
  | "CANCELLED_ON_CALL";
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

/** Buổi làm quen gần nhất của một yêu cầu. */
export interface IntroInfo {
  sessionId: Uuid;
  scheduledAt: IsoDateTime;
  durationMinutes: number;
  status: SessionStatus;
  /** Chỉ có giá trị khi buổi đã CONFIRMED. */
  meetingLink: string | null;
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
  menteeDecision: IntroDecision | null;
  mentorDecision: IntroDecision | null;
  intro: IntroInfo | null;
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
  kind: SessionKind;
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
