import type { IsoDateTime, Uuid } from "./common";
import type { LanguageCode, SessionType, TimeOfDay } from "./profile";

// contracts/matching-service.yaml
export interface RankedMentor {
  mentorId: Uuid;
  displayName: string;
  domain: string;
  skills: string[];
  similarityScore: number;
  finalScore: number;
  rating: number;
  ratingCount: number;
  yearsExperience: number;
  hourlyRate: number;
  matchedSkills: string[];
  reasons: string[];
  /** US-35 — tỉ lệ khung giờ mong muốn của mentee (14 ngày tới) trùng lịch rảnh mentor, 0–1. */
  scheduleFit: number;
  /** 1 = phản hồi ≤ 24 giờ, 0.5 = ≤ 72 giờ hoặc chưa có dữ liệu, 0 = chậm hơn. */
  responsiveness: number;
  medianResponseHours: number | null;
  /** < 3 đánh giá — xếp hạng bằng trung vị rating nền tảng. */
  newMentor: boolean;
  ratingUsed: number;
  /** Phần đóng góp từng tín hiệu vào finalScore (cộng lại = finalScore). */
  scoreParts: Partial<Record<keyof PipelineWeights, number>>;
  headline: string | null;
}

export type ExclusionReason = "notVerified" | "unavailable" | "noSchedule" | "fullCapacity" | "domainMismatch";

export interface PipelineWeights {
  similarity: number;
  rating: number;
  experience: number;
  /** US-35 */
  scheduleFit: number;
  responsiveness: number;
}

export interface PipelineStats {
  /** Số hồ sơ mentor được xét. */
  considered: number;
  /** Bị ràng buộc hệ thống loại (đếm trên toàn bộ mentor). */
  excluded: Partial<Record<ExclusionReason, number>>;
  /** US-36 — số mentor bạn đang ẩn ("Không phù hợp"). */
  hidden: number;
  /** Qua mọi ràng buộc hệ thống và mọi bộ lọc người dùng. */
  eligible: number;
  k: number;
  retrieved: number;
  returned: number;
  weights: PipelineWeights;
}

/** US-17 — tên bộ lọc = tên query param của GET /api/matching/mentors. */
export type MatchFilterName = "maxRate" | "days" | "timeOfDay" | "language" | "sessionType" | "minRating" | "freeOnly";

/** Bộ lọc người dùng; null / [] / false = không bật. */
export interface MatchFilterValues {
  maxRate: number | null;
  days: number[];
  timeOfDay: TimeOfDay | null;
  language: LanguageCode[];
  sessionType: SessionType | null;
  minRating: number | null;
  freeOnly: boolean;
}

/** Bộ lọc hiệu lực server trả lại, kèm những bộ lọc lấy từ sở thích hồ sơ. */
export interface EffectiveFilters extends MatchFilterValues {
  fromProfileDefaults: MatchFilterName[];
}

export interface MatchQuery {
  limit?: number;
  /** Bỏ trống = dùng sở thích hồ sơ cho các bộ lọc không truyền. */
  filters?: MatchFilterValues;
  useProfileDefaults?: boolean;
}

export interface MatchResult {
  menteeId: Uuid;
  mentors: RankedMentor[];
  pipeline: PipelineStats;
  filters: EffectiveFilters;
  /** US-18 — số mentor mỗi bộ lọc đang bật loại riêng (sẽ có thêm nếu chỉ bỏ bộ lọc đó). */
  excludedBy: Partial<Record<MatchFilterName, number>>;
  /** US-36 — id danh sách vừa hiển thị, gửi kèm phản hồi "Không phù hợp". */
  impressionId: Uuid | null;
}

/** US-36 (PRD-MATCH-6) */
export type NotRelevantReason = "WRONG_DOMAIN" | "TOO_EXPENSIVE" | "SCHEDULE" | "OTHER";

export interface MatchFeedback {
  id: Uuid;
  mentorId: Uuid;
  reason: NotRelevantReason;
  note: string | null;
  rank: number | null;
  createdAt: IsoDateTime;
  hiddenUntil: IsoDateTime;
}

export type IndexState = "UPDATED" | "UNCHANGED" | "PENDING";

export interface IndexStatus {
  userId: Uuid;
  role: "MENTOR" | "MENTEE" | null;
  status: IndexState;
  indexedAt: IsoDateTime | null;
}

export interface RebuildResult {
  mentors: number;
  mentees: number;
  pending: number;
}
