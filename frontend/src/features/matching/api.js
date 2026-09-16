import { api } from "@/lib/api";

// matching-service (Thảo)
export const matchingApi = {
  mentorsFor: (menteeId, limit = 10) => api(`/api/matching/mentors?menteeId=${menteeId}&limit=${limit}`),
};

export const EXCLUSION_LABELS = {
  notVerified: "chưa qua AI Interview",
  unavailable: "tạm ngưng nhận mentee",
  noSchedule: "chưa có lịch rảnh",
  fullCapacity: "đã đủ số mentee",
  domainMismatch: "khác lĩnh vực",
};
