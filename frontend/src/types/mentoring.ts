import type { IsoDateTime, Uuid } from "./common";
import type { SessionType } from "./profile";

// contracts/mentoring-service.yaml
export type RequestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
export type SessionStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
/** US-03 — thời lượng phiên được phép (phút). */
export type SessionDuration = 30 | 45 | 60 | 90 | 120;

export interface MentoringRequest {
  id: Uuid;
  menteeId: Uuid;
  menteeName: string;
  mentorId: Uuid;
  mentorName: string;
  message: string | null;
  status: RequestStatus;
  responseNote: string | null;
  createdAt: IsoDateTime;
  respondedAt: IsoDateTime | null;
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
}
