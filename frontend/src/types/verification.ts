/* Xác thực năng lực mentor: một buổi phỏng vấn AI trực tiếp (live), mentor trả lời bằng giọng nói và quay video.
   AI chấm theo tiêu chí; đạt thì tự cấp xác thực, không đạt thì báo điểm cần cải thiện, chưa rõ ràng thì chuyển quản trị viên. */

/** Trạng thái của một lượt xác thực (mỗi lĩnh vực một lượt, tối đa 3 lĩnh vực). */
export type VerifyStage =
  | "READY"           // chưa phỏng vấn, sẵn sàng bắt đầu
  | "IN_PROGRESS"     // đang phỏng vấn dở, còn trong thời hạn tiếp tục
  | "PENDING_REVIEW"  // kết quả chưa rõ ràng, chờ quản trị viên
  | "PASSED"          // đạt, đã được cấp xác thực
  | "FAILED"          // không đạt, chờ tới ngày được phỏng vấn lại
  | "EXPIRED";        // bị gián đoạn quá hạn, tính là không hoàn thành

export type VerifyOutcome = "PASSED" | "FAILED" | "UNCLEAR";

export interface VerifyCriterion {
  key: string;
  label: string;
  /** Thang 5. */
  score: number;
  comment: string;
}

export interface VerifyTrack {
  id: string;
  domain: string;
  stage: VerifyStage;
  /** Id buổi phỏng vấn đang dở (IN_PROGRESS). */
  interviewId?: string | null;
  /** Hạn tiếp tục buổi đang dở (ISO). */
  resumeDeadline?: string | null;
  /** Mô tả chỗ đang dừng, vd. "Chủ đề 3/5". */
  progressLabel?: string | null;
  topicsDone?: number | null;
  topicsTotal?: number | null;
  /** Được phỏng vấn lại từ thời điểm này (ISO). */
  retryAt?: string | null;
  /** Điểm tổng lần gần nhất, thang 5. */
  lastScore?: number | null;
  submittedAt?: string | null;
  /** Id kết quả gần nhất để mở trang kết quả. */
  resultId?: string | null;
  /** Nhận xét của quản trị viên khi đã xem xét. */
  adminNote?: string | null;
}

export interface VerifyRules {
  /** Thời lượng tối đa của buổi phỏng vấn (phút). */
  maxMinutes: number;
  /** Chủ đề sẽ được hỏi cho lĩnh vực. */
  topics: string[];
  /** Được tiếp tục buổi dở trong bao nhiêu giờ. */
  resumeHours: number;
  /** Phỏng vấn lại sau bao nhiêu ngày nếu không đạt. */
  retakeDays: number;
  /** Điểm đạt, thang 5. */
  passScore: number;
}

export interface VerifyOverview {
  tracks: VerifyTrack[];
  maxDomains: number;
  /** Lĩnh vực có thể thêm mới (chưa có lượt xác thực). */
  availableDomains: string[];
  rules: VerifyRules;
}

/* ---------- Buổi phỏng vấn live ---------- */

export type VerifyTurnRole = "ai" | "mentor";

export interface VerifyTurn {
  id: string;
  role: VerifyTurnRole;
  text: string;
  topic?: string | null;
  at: string;
}

export interface VerifyQuestion {
  id: string;
  topic: string;
  text: string;
  /** Câu cuối của buổi phỏng vấn: hiện nút "Kết thúc và nộp bài". */
  isLast: boolean;
  /** Gợi ý thời gian trả lời (giây). */
  suggestedSeconds: number;
}

export type VerifyInterviewStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";

export interface VerifyInterview {
  id: string;
  trackId: string;
  domain: string;
  status: VerifyInterviewStatus;
  startedAt: string;
  /** Hạn tiếp tục nếu bị gián đoạn (ISO). */
  resumeDeadline: string;
  /** Giây còn lại của cả buổi. */
  remainingSeconds: number;
  topics: string[];
  topicIndex: number;
  question: VerifyQuestion | null;
  turns: VerifyTurn[];
}

export interface VerifyAnswerInput {
  questionId: string;
  /** Văn bản nhận dạng từ giọng nói (có thể rỗng nếu trình duyệt không hỗ trợ). */
  transcript: string;
  durationSeconds: number;
  /** Đoạn video+âm thanh của câu trả lời. */
  media?: Blob | null;
}

/** Kết quả sau mỗi câu trả lời: câu kế tiếp (null khi đã nộp bài). */
export interface VerifyAnswerResult {
  interview: VerifyInterview;
}

/* ---------- Kết quả ---------- */

export interface VerifyResult {
  id: string;
  trackId: string;
  domain: string;
  outcome: VerifyOutcome;
  /** Điểm tổng, thang 5. */
  totalScore: number;
  passScore: number;
  criteria: VerifyCriterion[];
  /** Điểm cần cải thiện (khi không đạt). */
  improvements: string[];
  summary: string;
  retryAt?: string | null;
  submittedAt: string;
  /** Ai quyết định: AI tự động hay quản trị viên. */
  decidedBy: "AI" | "ADMIN" | null;
  adminNote?: string | null;
}

export type VerifyHistoryOutcome = VerifyOutcome | "INCOMPLETE";

export interface VerifyHistoryItem {
  id: string;
  domain: string;
  at: string;
  outcome: VerifyHistoryOutcome;
  totalScore: number | null;
}

/* ---------- Quản trị ---------- */

export type VerifyQueueFilter = "UNCLEAR" | "DECIDED";
export type VerifyRecommendation = "APPROVE" | "REVIEW" | "REJECT";
export type VerifyConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface VerifyQueueItem {
  id: string;
  name: string;
  email: string;
  years: number;
  domain: string;
  totalScore: number;
  recommendation: VerifyRecommendation;
  confidence: VerifyConfidence;
  /** Mốc bắt đầu chờ (ISO). */
  waitingSince: string;
  overdue: boolean;
  status: "UNCLEAR" | "APPROVED" | "REJECTED";
}

export interface VerifyQueue {
  stats: { unclear: number; overdue: number; approvedThisMonth: number; rejectedThisMonth: number };
  counts: Record<VerifyQueueFilter, number>;
  items: VerifyQueueItem[];
}

export interface VerifyAdminAnswer {
  id: string;
  topic: string;
  question: string;
  transcript: string;
  durationSeconds: number;
  /** URL phát video của câu trả lời (null: chưa có tệp, hiện khung giữ chỗ). */
  videoUrl: string | null;
  /** AI nhận xét riêng câu này. */
  note?: string | null;
}

export type VerifyDecision = "APPROVE" | "REJECT";

export interface VerifyAdminDetail {
  id: string;
  name: string;
  email: string;
  years: number;
  domain: string;
  mentorProfileHref: string;
  status: VerifyQueueItem["status"];
  totalScore: number;
  passScore: number;
  criteria: VerifyCriterion[];
  ai: { recommendation: VerifyRecommendation; confidence: VerifyConfidence; reason: string };
  answers: VerifyAdminAnswer[];
  durationLabel: string;
  submittedAt: string | null;
  attempt: string;
  /** Video được lưu tới (ISO), sau đó tự xoá. */
  keepUntil: string | null;
  decision?: { decision: VerifyDecision; decidedBy: "AI" | "ADMIN"; note: string; decidedAt: string } | null;
}

export interface VerifyDecisionInput { decision: VerifyDecision; note: string; reviewedVideo: boolean }
