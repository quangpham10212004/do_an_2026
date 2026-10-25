import type { IsoDateTime, Uuid } from "./common";

// contracts/ai-service.yaml — AI Interview
export type InterviewStatus = "IN_PROGRESS" | "PENDING_REVIEW" | "PASSED" | "REJECTED" | "RETAKE_REQUESTED" | "ABANDONED" | "INVALIDATED";
export type InterviewStrategy = "OPENING" | "DEEPEN" | "PIVOT";
export type Recommendation = "APPROVE" | "REJECT" | "NEEDS_REVIEW";
/** Duyệt vòng 1 của admin (docs/design-mentor-verification.md §7). */
export type Round1Decision = "PASS" | "REJECT" | "RETAKE";
export type ApplicationStatus = "ROUND1" | "ROUND1_REVIEW" | "ROUND2_PENDING_SLOTS" | "ROUND2_PENDING_CHOICE" | "ROUND2_SCHEDULED" | "APPROVED" | "REJECTED" | "CLOSED";

/** US-23: điểm 4 tiêu chí rubric (0–10). */
export interface RubricScores {
  technical: number;
  depth: number;
  communication: number;
  mentoring: number;
}

export type InterviewFlag = "PROMPT_INJECTION" | "COPIED_ANSWER";
/** Cờ của video vòng 1 (docs/design-mentor-verification.md §5.3–5.4): camera ngắt, hai bản chép lời lệch nhau. */
export type VideoFlag = "CAMERA_OFF" | "TRANSCRIPT_MISMATCH";
export type TranscriptCheck = "PENDING" | "OK" | "MISMATCH" | "UNAVAILABLE";

/** Video vòng 1 của một buổi phỏng vấn. Mentor chỉ thấy trạng thái; cờ và bản chép lời của server chỉ admin. */
export interface InterviewVideo {
  consentVideo: boolean;
  finished: boolean;
  processed: boolean;
  /** Còn file để phát (đã chốt, chưa hết hạn / chưa bị xoá). */
  available: boolean;
  sizeBytes: number;
  durationSeconds: number | null;
  chunkCount: number;
  gapDetected: boolean;
  gapTotalSeconds: number;
  flags: VideoFlag[];
  transcriptCheck: TranscriptCheck | null;
  transcriptDiff: number | null;
  serverTranscript: string | null;
  expiresAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface InterviewTurn {
  turnNo: number;
  topic: string;
  strategy: InterviewStrategy;
  question: string;
  answer: string | null;
  /** 0-10; null với mentor khi buổi phỏng vấn chưa kết thúc */
  score: number | null;
  feedback: string | null;
  /** null với lượt trước Sprint 3 hoặc khi điểm đang ẩn với mentor */
  rubric: RubricScores | null;
  /** chỉ admin */
  flags: InterviewFlag[];
  engine: string | null;
  model: string | null;
  promptVersion: string | null;
  fallbackUsed: boolean | null;
  durationSeconds: number | null;
  askedAt: IsoDateTime;
  answeredAt: IsoDateTime | null;
}

export interface Interview {
  id: Uuid;
  mentorId: Uuid;
  mentorName: string | null;
  /** Đợt xác thực chứa buổi này (null với buổi cũ trước migration 013). */
  applicationId?: Uuid | null;
  /** Video vòng 1 (camera bắt buộc); null với buổi trước migration 014. */
  video?: InterviewVideo | null;
  domain: string;
  skills: string[];
  status: InterviewStatus;
  /** FR-7.7 — luôn VOICE (phỏng vấn giọng nói, OpenAI Realtime). */
  mode?: InterviewMode;
  consentExternalAi?: boolean;
  /** v2.1 — kế hoạch câu hỏi của buổi giọng nói kèm nguồn (chỉ admin); null = buổi cũ */
  plan?: PlanTopic[] | null;
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
  /** US-23: có lượt bị gắn cờ (chỉ admin) */
  flagged: boolean;
  /** US-22: mentor đã xác nhận tự trả lời (false với buổi phỏng vấn trước Sprint 3). */
  selfAnswerAcknowledged: boolean;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
  /** US-43 (PRD-AIV-3): hạn tiếp tục (bắt đầu + VOICE_SESSION_MINUTES phút); null khi không còn IN_PROGRESS. */
  resumeDeadline?: IsoDateTime | null;
  /** US-43 (PRD-AIV-5): mentor chỉ thấy điểm / nhận xét từng câu sau khi admin quyết định. */
  feedbackVisible?: boolean;
  /** US-43 (PRD-AIV-2) */
}

export type InterviewMode = "VOICE";

/** GET /api/ai/verification/status — mentor đang ở đâu trong đợt xác thực, còn mấy lần, bao giờ được làm lại. */
export interface VerificationState {
  applicationId: Uuid | null;
  status: ApplicationStatus | null;
  /** Số lần làm vòng 1 không hoàn thành hợp lệ (bỏ dở); admin yêu cầu làm lại không tính. */
  attemptsUsed: number;
  attemptsLeft: number;
  maxAttempts: number;
  retakeCount: number;
  retakeLimit: number;
  retryAfter: IsoDateTime | null;
  canStart: boolean;
  reason: "IN_PROGRESS" | "PENDING_REVIEW" | "ALREADY_APPROVED" | "COOLDOWN" | null;
  /** Server có OPENAI_API_KEY (phỏng vấn giọng nói dùng được). */
  voiceAvailable: boolean;
}

/** Một đợt xác thực mentor (admin): trạng thái, số lần, buổi vòng 1 mới nhất (chi tiết có đủ các lần làm). */
export interface VerificationApplication {
  id: Uuid;
  mentorId: Uuid;
  mentorName: string | null;
  status: ApplicationStatus;
  attemptsUsed: number;
  attemptsLeft: number;
  maxAttempts: number;
  retakeCount: number;
  retakeLimit: number;
  round1Decision: Round1Decision | null;
  round1Note: string | null;
  round1ReviewedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
  retryAfter: IsoDateTime | null;
  createdAt: IsoDateTime;
  interview: Interview | null;
  interviews: Interview[];
}

/** Phỏng vấn giọng nói (OpenAI Realtime): client secret ngắn hạn, trình duyệt kết nối WebRTC trực tiếp tới OpenAI. */
export interface VoiceSession {
  clientSecret: string;
  expiresAt: number;
  model: string;
  topics: string[];
}

/** marker = model gọi begin_topic(topicNo); assistant / user = một lượt nói đã chép lời. */
export interface VoiceTranscriptItem {
  role: "marker" | "assistant" | "user";
  text?: string;
  topicNo?: number;
}

/** FR-7.7 — POST /api/ai/interviews/voice. voice = null khi server chưa có OPENAI_API_KEY (chỉ ngoài prod). */
export interface VoiceInterviewStart {
  interview: Interview;
  voice: VoiceSession | null;
}

// FR-10.x — Luyện phỏng vấn với AI (mentee)
export type PracticeType = "BACKEND" | "FRONTEND" | "SYSTEM_DESIGN" | "BEHAVIORAL";
export type PracticeLevel = "INTERN" | "FRESHER" | "JUNIOR";
export type PracticeStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

/** Rubric luyện phỏng vấn (0–10 mỗi tiêu chí), trọng số 35/25/25/15. */
export interface PracticeRubric {
  technical: number;
  problemSolving: number;
  communication: number;
  structure: number;
}

export interface PracticeTurn {
  topicNo: number;
  topic: string;
  question: string;
  answer: string;
  score: number;
  rubric: PracticeRubric;
  feedback: string;
  flags: string[];
}

export interface SpeakingReport {
  fillerCount: number;
  fillers: Record<string, number>;
  answerCount: number;
  avgWordsPerAnswer: number;
  shortAnswers: number;
  unanswered: number;
}

export interface PracticeResult {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  turns: PracticeTurn[];
  speaking: SpeakingReport;
  engine: "DEEPSEEK" | "RULE_BASED";
  model: string | null;
  promptVersion: string;
  fallbackUsed: boolean;
}

/** v2.1 — nguồn của câu hỏi: ngân hàng câu hỏi, CV, mục tiêu / công việc nhắm tới, hoặc AI soạn theo lĩnh vực. */
export type PlanSource = "BANK" | "CV" | "GOAL" | "AI";

export interface PlanTopic {
  name: string;
  question: string;
  source: PlanSource;
}

export interface Practice {
  id: Uuid;
  menteeId: Uuid;
  interviewType: PracticeType;
  level: PracticeLevel;
  targetRole: string;
  targetCompany: string | null;
  status: PracticeStatus;
  topics: string[];
  /** v2.1 — kế hoạch câu hỏi kèm nguồn; null khi đang làm (không lộ câu hỏi trước) */
  plan?: PlanTopic[] | null;
  engine: "DEEPSEEK" | "RULE_BASED";
  consentExternalAi: boolean;
  overallScore: number | null;
  result: PracticeResult | null;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  resumeDeadline: IsoDateTime | null;
}

export interface PracticeEligibility {
  freeLimit: number;
  used: number;
  canStart: boolean;
  reason: "PRACTICE_FREE_USED" | "IN_PROGRESS" | null;
  inProgressId: Uuid | null;
  voiceAvailable: boolean;
}

export interface PracticeStart {
  practice: Practice;
  voice: VoiceSession | null;
}

export interface StartPracticeInput {
  interviewType: PracticeType;
  level: PracticeLevel;
  targetRole: string;
  targetCompany?: string | null;
  consentExternalAi: boolean;
}

export interface InterviewStats {
  interviewsInProgress: number;
  interviewsPendingReview: number;
  mentorsApproved: number;
  mentorsRejected: number;
  retakesRequested: number;
  /** US-24 — chỉ số online: quyết định admin so với khuyến nghị AI */
  decisionsTotal: number;
  /** số quyết định mà AI đã khuyến nghị APPROVE / REJECT */
  decisionsComparable: number;
  decisionsAgreeing: number;
  /** AI khuyến nghị NEEDS_REVIEW — không tính vào tỉ lệ */
  decisionsOnNeedsReview: number;
  /** 0..1; null khi chưa có quyết định so sánh được */
  agreementRate: number | null;
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
  /** US-45: mentee bấm "Bỏ qua" (answer = ""). */
  skipped: boolean;
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
  /** US-45: kỹ năng đã duyệt từ CV — chip gợi ý; addedSkills = những kỹ năng đã thêm vào hồ sơ. */
  suggestedSkills: string[];
  addedSkills: string[];
}

/** Một CV trong danh sách "CV của tôi" (GET /api/ai/cv/mine). */
export interface CvSummary {
  id: Uuid;
  fileName: string;
  uploadedAt: IsoDateTime;
  /** Dạng /api/ai/cv/{id}/file — cần access token, tải qua apiBlob(). */
  fileUrl: string;
  consentExternalAi: boolean;
  /** US-45: file + văn bản gốc bị xoá 12 tháng sau khi tải lên. */
  purgedAt: IsoDateTime | null;
  deleteAfter: IsoDateTime;
  addedSkills: string[];
}

export interface CvUploadResult {
  cv: Cv;
  /** US-20: null cho tới khi người dùng duyệt thông tin CV và bắt đầu chatbot. */
  conversation: Conversation | null;
}
