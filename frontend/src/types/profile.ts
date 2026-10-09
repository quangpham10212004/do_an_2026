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
  /** US-37 — ≤ 80 ký tự; undefined = giữ nguyên, "" = xoá. */
  headline?: string;
}

/** US-37 (PRD-PROF-1) — điểm hoàn thiện hồ sơ. */
export interface CompletenessItem {
  key: string;
  label: string;
  weight: number;
  done: boolean;
}

export interface Completeness {
  score: number;
  items: CompletenessItem[];
}

/** US-04 */
export type SessionType = "CAREER_ADVICE" | "CODE_REVIEW" | "MOCK_INTERVIEW" | "PROJECT_GUIDANCE";
export type LanguageCode = "vi" | "en";

export interface BookingSettingsInput {
  meetingLink: string | null;
  bufferMinutes: 0 | 15 | 30;
  minNoticeHours: number;
  languages: LanguageCode[];
  sessionTypes: SessionType[];
  timezone: string | null;
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
  /** US-04 — chỉ chủ hồ sơ/admin thấy, người khác nhận null. */
  meetingLink: string | null;
  bufferMinutes: 0 | 15 | 30;
  minNoticeHours: number;
  languages: LanguageCode[];
  sessionTypes: SessionType[];
  timezone: string;
  availability: AvailabilitySlot[];
  /** Ngoại lệ lịch rảnh 60 ngày tới. */
  exceptions: AvailabilityException[];
  /** US-37 */
  headline: string | null;
  avatarUrl: string | null;
  /** null khi xem hồ sơ người khác. */
  completeness: Completeness | null;
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

/** US-16 — buổi muốn học: MORNING 06–12, AFTERNOON 12–18, EVENING 18–23. */
export type TimeOfDay = "MORNING" | "AFTERNOON" | "EVENING";

/** US-16 (PRD-PROF-2) — sở thích tìm mentor; matching dùng làm bộ lọc mặc định. Rỗng/null = không giới hạn. */
export interface MenteePreferences {
  /** ISO-8601: 1 = Thứ Hai ... 7 = Chủ Nhật. */
  preferredDays: number[];
  preferredTimeOfDay: TimeOfDay | null;
  /** VND / giờ. */
  budgetMaxPerHour: number | null;
  languages: LanguageCode[];
}

export interface MenteeProfile extends MenteePreferences {
  userId: Uuid;
  displayName: string;
  goal: string | null;
  domain: string;
  currentLevel: Level;
  skills: string[];
  portfolioLinks: string[];
  cvFileUrl: string | null;
  /** US-37 */
  timezone: string;
  avatarUrl: string | null;
  completeness: Completeness;
  /** Nút AI Matching bật khi completeness.score ≥ 50. */
  matchingEnabled: boolean;
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
  /** US-37 */
  headline: string | null;
  avatarUrl: string | null;
}

export interface MentorSearchParams {
  domain?: string;
  q?: string;
  page?: number;
  size?: number;
  includeUnverified?: boolean;
}

/** US-27 — một dòng của trang /admin/mentors (GET /api/profile/admin/mentors). */
export interface AdminMentorRow {
  userId: Uuid;
  displayName: string;
  domain: string;
  verificationStatus: VerificationStatus;
  status: MentorStatus;
  onLeaveUntil: string | null;
  suspendedReason: string | null;
  suspendedAt: string | null;
  /** Admin thực hiện; null = hệ thống (tranh chấp). */
  suspendedBy: Uuid | null;
  rating: number;
  ratingCount: number;
  activeMenteeCount: number;
  capacity: number;
}

export interface AdminMentorFilters {
  q?: string;
  status?: MentorStatus | "";
  verification?: VerificationStatus | "";
  page?: number;
}

/** US-27 — kết quả đình chỉ / gỡ đình chỉ. mentoringNotified=false: chưa báo được mentoring-service huỷ phiên. */
export interface SuspensionResult {
  mentor: AdminMentorRow;
  mentoringNotified: boolean;
  cancelledSessions: number | null;
  warning: string | null;
}
