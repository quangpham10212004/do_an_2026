import { api } from "@/lib/api";
import { setDisplayTimeZone } from "@/lib/format";
import type {
  AdminMentorFilters,
  AdminMentorRow,
  SuspensionResult,
  BookingSettingsInput,
  LanguageCode,
  SessionType,
  AvailabilityException,
  AvailabilityExceptionInput,
  AvailabilityExceptionResult,
  AvailabilitySlot,
  MenteePreferences,
  MenteeProfile,
  MenteeProfileInput,
  MentorCard,
  MentorProfile,
  MentorProfileInput,
  MentorSearchParams,
  MentorStatus,
  MentorStatusInput,
  PageResponse,
  TimeOfDay,
  Uuid,
} from "@/types";

// profile-service (Thảo)
export const profileApi = {
  getMentor: (id: Uuid) => api<MentorProfile>(`/api/profile/mentor/${id}`),
  saveMentor: (id: Uuid, body: MentorProfileInput) => api<MentorProfile>(`/api/profile/mentor/${id}`, { method: "PUT", body }),
  getAvailability: (id: Uuid) => api<AvailabilitySlot[]>(`/api/profile/mentor/${id}/availability`),
  saveAvailability: (id: Uuid, slots: AvailabilitySlot[]) =>
    api<AvailabilitySlot[]>(`/api/profile/mentor/${id}/availability`, { method: "PUT", body: { slots } }),
  // US-04 — cài đặt đặt lịch
  saveBookingSettings: (id: Uuid, body: BookingSettingsInput) =>
    api<MentorProfile>(`/api/profile/mentor/${id}/booking-settings`, { method: "PUT", body }),
  // US-08 — trạng thái nhận mentee
  changeStatus: (id: Uuid, body: MentorStatusInput) =>
    api<MentorProfile>(`/api/profile/mentor/${id}/status`, { method: "PUT", body }),
  // US-07 — ngoại lệ lịch rảnh
  getExceptions: (id: Uuid) => api<AvailabilityException[]>(`/api/profile/mentor/${id}/exceptions`),
  createException: (id: Uuid, body: AvailabilityExceptionInput) =>
    api<AvailabilityExceptionResult>(`/api/profile/mentor/${id}/exceptions`, { method: "POST", body }),
  updateException: (id: Uuid, exceptionId: Uuid, body: AvailabilityExceptionInput) =>
    api<AvailabilityExceptionResult>(`/api/profile/mentor/${id}/exceptions/${exceptionId}`, { method: "PUT", body }),
  deleteException: (id: Uuid, exceptionId: Uuid) =>
    api<null>(`/api/profile/mentor/${id}/exceptions/${exceptionId}`, { method: "DELETE" }),
  getMentee: (id: Uuid) => api<MenteeProfile>(`/api/profile/mentee/${id}`),
  saveMentee: (id: Uuid, body: MenteeProfileInput) => api<MenteeProfile>(`/api/profile/mentee/${id}`, { method: "PUT", body }),
  // US-16 — sở thích tìm mentor
  saveMenteePreferences: (id: Uuid, body: MenteePreferences) =>
    api<MenteeProfile>(`/api/profile/mentee/${id}/preferences`, { method: "PUT", body }),
  // US-27 — admin đình chỉ mentor
  adminListMentors: ({ q = "", status = "", verification = "", page = 0 }: AdminMentorFilters = {}) =>
    api<PageResponse<AdminMentorRow>>(
      `/api/profile/admin/mentors?q=${encodeURIComponent(q)}&status=${status}&verification=${verification}&page=${page}&size=20`,
    ),
  adminSuspendMentor: (id: Uuid, reason: string) =>
    api<SuspensionResult>(`/api/profile/admin/mentors/${id}/suspend`, { method: "POST", body: { reason } }),
  adminUnsuspendMentor: (id: Uuid) =>
    api<SuspensionResult>(`/api/profile/admin/mentors/${id}/unsuspend`, { method: "POST" }),
  // US-37 — múi giờ (mọi giờ hiển thị theo múi giờ này) và ảnh đại diện
  saveTimezone: async (id: Uuid, timezone: string) => {
    const res = await api<{ timezone: string }>(`/api/profile/${id}/timezone`, { method: "PUT", body: { timezone } });
    setDisplayTimeZone(res.timezone);
    return res;
  },
  uploadAvatar: (id: Uuid, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<{ avatarUrl: string }>(`/api/profile/${id}/avatar`, { method: "PUT", form });
  },
  deleteAvatar: (id: Uuid) => api<null>(`/api/profile/${id}/avatar`, { method: "DELETE" }),
  searchMentors: ({ domain = "", q = "", page = 0, size = 12, includeUnverified = false }: MentorSearchParams = {}) =>
    api<PageResponse<MentorCard>>(
      `/api/profile/mentors?domain=${encodeURIComponent(domain)}&q=${encodeURIComponent(q)}&page=${page}&size=${size}&includeUnverified=${includeUnverified}`,
    ),
};

export const DOMAINS: ReadonlyArray<readonly [value: string, label: string]> = [
  ["backend", "Backend"],
  ["frontend", "Frontend"],
  ["fullstack", "Fullstack"],
  ["devops", "DevOps / Cloud"],
  ["data", "Data / AI"],
  ["mobile", "Mobile"],
];

export const domainLabel = (value: string | null | undefined): string =>
  DOMAINS.find(([v]) => v === value?.toLowerCase())?.[1] || value || "";

/** "2026-10-20" → "T3, 20/10/2026" (không qua Date để tránh lệch múi giờ). */
export function formatLocalDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  const weekday = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export const exceptionTimeLabel = (e: { startTime: string | null; endTime: string | null }): string =>
  e.startTime && e.endTime ? `${e.startTime} – ${e.endTime}` : "Nghỉ cả ngày";

export const MENTOR_STATUS_LABELS: Record<MentorStatus, string> = {
  ACCEPTING: "Đang nhận mentee",
  PAUSED: "Tạm ngưng nhận",
  ON_LEAVE: "Đang nghỉ phép",
  SUSPENDED: "Bị đình chỉ",
};

/** Nhãn trạng thái kèm ngày hết nghỉ phép nếu có. */
export function mentorStatusText(status: MentorStatus, onLeaveUntil: string | null): string {
  if (status === "ON_LEAVE" && onLeaveUntil) return `Nghỉ phép đến hết ${formatLocalDate(onLeaveUntil)}`;
  return MENTOR_STATUS_LABELS[status];
}

/** US-27 — nhãn cho người xem không phải chủ hồ sơ/admin: mentor bị đình chỉ chỉ hiện "Tạm ngưng". */
export function publicMentorStatusText(status: MentorStatus, onLeaveUntil: string | null): string {
  return status === "SUSPENDED" ? "Tạm ngưng" : mentorStatusText(status, onLeaveUntil);
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  CAREER_ADVICE: "Tư vấn nghề nghiệp",
  CODE_REVIEW: "Review code",
  MOCK_INTERVIEW: "Phỏng vấn thử",
  PROJECT_GUIDANCE: "Hướng dẫn dự án",
};

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  MORNING: "Buổi sáng (6h–12h)",
  AFTERNOON: "Buổi chiều (12h–18h)",
  EVENING: "Buổi tối (18h–23h)",
};

export const LANGUAGE_LABELS: Record<LanguageCode, string> = { vi: "Tiếng Việt", en: "Tiếng Anh" };

/** US-37 (PRD-PROF-6) — các múi giờ hay dùng; hồ sơ nhận mọi tên IANA hợp lệ. */
export const COMMON_TIMEZONES: ReadonlyArray<readonly [value: string, label: string]> = [
  ["Asia/Ho_Chi_Minh", "Việt Nam (GMT+7)"],
  ["Asia/Bangkok", "Bangkok (GMT+7)"],
  ["Asia/Singapore", "Singapore (GMT+8)"],
  ["Asia/Tokyo", "Tokyo (GMT+9)"],
  ["Asia/Seoul", "Seoul (GMT+9)"],
  ["Australia/Sydney", "Sydney"],
  ["Europe/London", "London"],
  ["Europe/Paris", "Paris / Berlin"],
  ["America/New_York", "New York"],
  ["America/Los_Angeles", "Los Angeles"],
  ["UTC", "UTC"],
];
