import { api } from "@/lib/api";
import type { ExclusionReason, IndexStatus, MatchFilterValues, MatchQuery, MatchResult, RebuildResult, Uuid } from "@/types";

/** Query string cho bộ lọc: chỉ gửi bộ lọc đang bật (null / [] / false bị bỏ qua). */
export function filterParams(filters: MatchFilterValues): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.maxRate !== null) p.set("maxRate", String(filters.maxRate));
  filters.days.forEach((d) => p.append("days", String(d)));
  if (filters.timeOfDay) p.set("timeOfDay", filters.timeOfDay);
  filters.language.forEach((l) => p.append("language", l));
  if (filters.sessionType) p.set("sessionType", filters.sessionType);
  if (filters.minRating !== null) p.set("minRating", String(filters.minRating));
  if (filters.freeOnly) p.set("freeOnly", "true");
  return p;
}

// matching-service (Thảo)
export const matchingApi = {
  /**
   * US-17 — không truyền filters: server lấy sở thích hồ sơ làm bộ lọc. Truyền filters thì gửi kèm
   * useProfileDefaults=false (mặc định) để bộ lọc trên thanh lọc là toàn bộ điều kiện của lượt tìm này.
   */
  mentorsFor: (menteeId: Uuid, { limit = 10, filters, useProfileDefaults = filters === undefined }: MatchQuery = {}) => {
    const p = filters ? filterParams(filters) : new URLSearchParams();
    p.set("menteeId", menteeId);
    p.set("limit", String(limit));
    p.set("useProfileDefaults", String(useProfileDefaults));
    return api<MatchResult>(`/api/matching/mentors?${p.toString()}`);
  },
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
