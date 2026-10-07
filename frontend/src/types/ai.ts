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
  /** US-19: false => CV này chỉ được xử lý bằng engine rule-based (không gửi DeepSeek). */
  consentExternalAi: boolean;
  /** US-20: null = chưa duyệt kết quả parse (chatbot chưa bắt đầu). */
  confirmedFields: ConfirmedCvFields | null;
  confirmedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

/** US-20: thông tin CV người dùng đã xem lại / sửa / bỏ (PUT /api/ai/cv/{id}/confirmed-fields). */
export interface ConfirmedCvFields {
  role: string | null;
  skills: string[];
  yearsExperience: number | null;
  projects: CvProject[];
  education: string[];
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

/** US-21: NONE (chưa xong) → DRAFT → CONFIRMED (đồng bộ hồ sơ) | DISCARDED (không gửi gì). */
export type EnrichmentGoalStatus = "NONE" | "DRAFT" | "CONFIRMED" | "DISCARDED";

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
  /** Goal NHÁP do chatbot tổng hợp — không tự ghi vào hồ sơ (US-21). */
  enrichedGoal: string | null;
  goalStatus: EnrichmentGoalStatus;
  /** Goal người dùng đã chọn dùng (có thể đã sửa). */
  confirmedGoal: string | null;
  goalDecidedAt: IsoDateTime | null;
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
  consentExternalAi: boolean;
}

export interface CvUploadResult {
  cv: Cv;
  /** US-20: null cho tới khi người dùng duyệt thông tin CV và bắt đầu chatbot. */
  conversation: Conversation | null;
}
