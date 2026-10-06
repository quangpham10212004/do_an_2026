import type { IsoDateTime, Uuid } from "./common";

// contracts/ai-service.yaml — AI Interview
export type InterviewStatus = "IN_PROGRESS" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type InterviewStrategy = "OPENING" | "DEEPEN" | "PIVOT";
export type Recommendation = "APPROVE" | "REJECT" | "NEEDS_REVIEW";
export type ReviewDecision = "APPROVE" | "REJECT";

export interface InterviewTurn {
  turnNo: number;
  topic: string;
  strategy: InterviewStrategy;
  question: string;
  answer: string | null;
  /** 0-10; null với mentor khi buổi phỏng vấn chưa kết thúc */
  score: number | null;
  feedback: string | null;
  askedAt: IsoDateTime;
  answeredAt: IsoDateTime | null;
}

export interface Interview {
  id: Uuid;
  mentorId: Uuid;
  mentorName: string | null;
  domain: string;
  skills: string[];
  status: InterviewStatus;
  engine: "DEEPSEEK" | "RULE_BASED";
  maxTurns: number;
  currentTurn: number;
  currentQuestion: InterviewTurn | null;
  turns: InterviewTurn[];
  overallScore: number | null;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendation: Recommendation | null;
  reviewNote: string | null;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
}

export interface InterviewStats {
  interviewsInProgress: number;
  interviewsPendingReview: number;
  mentorsApproved: number;
  mentorsRejected: number;
}

// CV parsing + chatbot enrichment
export interface CvProject {
  name: string;
  description: string;
  technologies: string[];
}

export interface ParsedCv {
  currentRole: string | null;
  skills: string[];
  yearsExperience: number | null;
  projects: CvProject[];
  education: string[];
  summary: string | null;
}

export interface Cv {
  id: Uuid;
  fileName: string;
  engine: string;
  parsed: ParsedCv;
  createdAt: IsoDateTime;
}

export type EnrichmentSlot =
  | "TARGET_ROLE"
  | "FOCUS_AREAS"
  | "PROJECT_EXPERIENCE"
  | "CURRENT_GAPS"
  | "TIMELINE"
  | "MENTORING_PREFERENCE"
  | "FREE_FORM";

export interface EnrichmentMessage {
  turnNo: number;
  slot: EnrichmentSlot;
  slotLabel: string;
  question: string;
  answer: string | null;
}

export interface Conversation {
  id: Uuid;
  menteeId: Uuid;
  cvId: Uuid;
  status: "IN_PROGRESS" | "COMPLETED";
  engine: string;
  maxTurns: number;
  currentTurn: number;
  currentQuestion: EnrichmentMessage | null;
  messages: EnrichmentMessage[];
  enrichedGoal: string | null;
  profileSynced: boolean;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
}

/** Một CV trong danh sách "CV của tôi" (GET /api/ai/cv/mine). */
export interface CvSummary {
  id: Uuid;
  fileName: string;
  uploadedAt: IsoDateTime;
  /** Dạng /api/ai/cv/{id}/file — cần access token, tải qua apiBlob(). */
  fileUrl: string;
}

export interface CvUploadResult {
  cv: Cv;
  conversation: Conversation;
}
