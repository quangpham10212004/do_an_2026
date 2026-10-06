import type { IsoDateTime, Uuid } from "./common";

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
}

export type ExclusionReason = "notVerified" | "unavailable" | "noSchedule" | "fullCapacity" | "domainMismatch";

export interface PipelineWeights {
  similarity: number;
  rating: number;
  experience: number;
}

export interface PipelineStats {
  k: number;
  retrieved: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  returned: number;
  weights: PipelineWeights;
}

export interface MatchResult {
  menteeId: Uuid;
  mentors: RankedMentor[];
  pipeline: PipelineStats;
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
