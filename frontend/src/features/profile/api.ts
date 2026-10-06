import { api } from "@/lib/api";
import type {
  AvailabilitySlot,
  MenteeProfile,
  MenteeProfileInput,
  MentorCard,
  MentorProfile,
  MentorProfileInput,
  MentorSearchParams,
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
