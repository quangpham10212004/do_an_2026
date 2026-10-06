import type { IsoDateTime, Uuid } from "./common";

// contracts/mentoring-service.yaml
export type RequestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
export type SessionStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

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
  durationMinutes: number;
  price: number;
  topic: string | null;
  status: SessionStatus;
  reviewed: boolean;
  reviewRating: number | null;
  createdAt: IsoDateTime;
}

export interface BookSessionInput {
  menteeId: Uuid;
  mentorId: Uuid;
  scheduledAt: IsoDateTime;
  durationMinutes: number;
  topic?: string;
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
