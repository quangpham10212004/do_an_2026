import type { Uuid } from "./common";

// contracts/profile-service.yaml
export type VerificationStatus = "PENDING_INTERVIEW" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
/** US-08 — trạng thái nhận mentee (thay cho isAvailable). SUSPENDED chỉ do admin/hệ thống đặt. */
export type MentorStatus = "ACCEPTING" | "PAUSED" | "ON_LEAVE" | "SUSPENDED";

export interface AvailabilitySlot {
  id?: Uuid;
  /** ISO-8601: 1 = Thứ Hai … 7 = Chủ Nhật */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** US-07 — ngoại lệ lịch rảnh; startTime = endTime = null nghĩa là nghỉ cả ngày. */
export interface AvailabilityException {
  id: Uuid;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface AvailabilityExceptionInput {
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason?: string | null;
}

export interface AvailabilityExceptionResult {
  exception: AvailabilityException;
  warning: string | null;
}

export interface MentorProfileInput {
  displayName: string;
  skills: string[];
  domain: string;
  bio: string;
  yearsExperience?: number;
  cvFileUrl?: string | null;
  portfolioLinks?: string[];
  hourlyRate?: number;
  capacity?: number;
  /** @deprecated dùng PUT /status (US-08); true → ACCEPTING, false → PAUSED. */
  isAvailable?: boolean;
}

export interface MentorStatusInput {
  status: Exclude<MentorStatus, "SUSPENDED">;
  /** YYYY-MM-DD, bắt buộc khi ON_LEAVE (nghỉ hết ngày này). */
  onLeaveUntil?: string | null;
  reason?: string | null;
}

export interface MentorProfile {
  userId: Uuid;
  displayName: string;
  skills: string[];
  domain: string;
  bio: string | null;
  yearsExperience: number;
  cvFileUrl: string | null;
  portfolioLinks: string[];
  hourlyRate: number;
  capacity: number;
  activeMenteeCount: number;
  /** = status === "ACCEPTING" */
  isAvailable: boolean;
  rating: number;
  ratingCount: number;
  verificationStatus: VerificationStatus;
  /** Trạng thái hiệu lực (nghỉ phép đã hết hạn tính là ACCEPTING). */
  status: MentorStatus;
  onLeaveUntil: string | null;
  statusReason: string | null;
  availability: AvailabilitySlot[];
  /** Ngoại lệ lịch rảnh 60 ngày tới. */
  exceptions: AvailabilityException[];
}

export interface MenteeProfileInput {
  displayName: string;
  goal: string;
  domain: string;
  currentLevel?: Level;
  skills?: string[];
  portfolioLinks?: string[];
  cvFileUrl?: string | null;
}

export interface MenteeProfile {
  userId: Uuid;
  displayName: string;
  goal: string | null;
  domain: string;
  currentLevel: Level;
  skills: string[];
  portfolioLinks: string[];
  cvFileUrl: string | null;
}

/** Thẻ mentor ở trang duyệt danh sách (GET /api/profile/mentors). */
export interface MentorCard {
  userId: Uuid;
  displayName: string;
  domain: string;
  skills: string[];
  yearsExperience: number;
  rating: number;
  ratingCount: number;
  hourlyRate: number;
  isAvailable: boolean;
  hasCapacity: boolean;
  verificationStatus: VerificationStatus;
  status: MentorStatus;
  onLeaveUntil: string | null;
}

export interface MentorSearchParams {
  domain?: string;
  q?: string;
  page?: number;
  size?: number;
  includeUnverified?: boolean;
}
