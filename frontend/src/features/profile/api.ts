import { api } from "@/lib/api";
import type {
  AvailabilityException,
  AvailabilityExceptionInput,
  AvailabilityExceptionResult,
  AvailabilitySlot,
  MenteeProfile,
  MenteeProfileInput,
  MentorCard,
  MentorProfile,
  MentorProfileInput,
  MentorSearchParams,
  MentorStatus,
  MentorStatusInput,
  PageResponse,
  Uuid,
} from "@/types";

// profile-service (Thảo)
export const profileApi = {
  getMentor: (id: Uuid) => api<MentorProfile>(`/api/profile/mentor/${id}`),
  saveMentor: (id: Uuid, body: MentorProfileInput) => api<MentorProfile>(`/api/profile/mentor/${id}`, { method: "PUT", body }),
  getAvailability: (id: Uuid) => api<AvailabilitySlot[]>(`/api/profile/mentor/${id}/availability`),
  saveAvailability: (id: Uuid, slots: AvailabilitySlot[]) =>
    api<AvailabilitySlot[]>(`/api/profile/mentor/${id}/availability`, { method: "PUT", body: { slots } }),
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
