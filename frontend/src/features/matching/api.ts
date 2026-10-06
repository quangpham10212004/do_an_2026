import { api } from "@/lib/api";
import type { ExclusionReason, IndexStatus, MatchResult, RebuildResult, Uuid } from "@/types";

// matching-service (Thảo)
export const matchingApi = {
  mentorsFor: (menteeId: Uuid, limit = 10) => api<MatchResult>(`/api/matching/mentors?menteeId=${menteeId}&limit=${limit}`),
  // Chỉ mục embedding thuộc matching-service (xem CONVENTIONS.md mục 1).
  indexStatus: (userId: Uuid) => api<IndexStatus>(`/api/matching/index-status?userId=${userId}`),
  rebuildEmbeddings: (force: boolean) =>
    api<RebuildResult>(`/api/matching/admin/embeddings/rebuild?force=${force}`, { method: "POST" }),
};

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  notVerified: "chưa qua AI Interview",
  unavailable: "tạm ngưng nhận mentee",
  noSchedule: "chưa có lịch rảnh",
  fullCapacity: "đã đủ số mentee",
  domainMismatch: "khác lĩnh vực",
};
