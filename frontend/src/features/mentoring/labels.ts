import type {
  AttendanceAnswer,
  AttendanceResolution,
  DisputeOutcome,
  EndReason,
  DisputeType,
  ExpectedDurationMonths,
  MessageReportOutcome,
  MessageReportReason,
  RejectReason,
  RequestFrequency,
  SessionDuration,
  SessionType,
} from "@/types";

// Nhãn tiếng Việt cho các giá trị enum của mentoring-service (contracts/mentoring-service.yaml).

export const SESSION_DURATIONS: SessionDuration[] = [30, 45, 60, 90, 120];

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  CAREER_ADVICE: "Tư vấn nghề nghiệp",
  CODE_REVIEW: "Review code",
  MOCK_INTERVIEW: "Phỏng vấn thử",
  PROJECT_GUIDANCE: "Hướng dẫn dự án",
};

export const SESSION_TYPES = Object.keys(SESSION_TYPE_LABELS) as SessionType[];

export const AGENDA_MIN = 20;
export const AGENDA_MAX = 500;

/**
 * Nhãn trạng thái của mentoring-service (phiên, yêu cầu) và payment-service (giao dịch) — dùng với
 * MentoringStatusBadge ở mọi trang hiển thị các trạng thái này (US-12/13/15 thêm trạng thái mới).
 */
export const MENTORING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ xử lý",
  CONFIRMED: "Đã xác nhận",
  AWAITING_ATTENDANCE: "Chờ xác nhận tham dự",
  COMPLETED: "Hoàn thành",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã huỷ",
  NO_SHOW_MENTEE: "Mentee vắng mặt",
  NO_SHOW_MENTOR: "Mentor vắng mặt",
  DISPUTED: "Đang tranh chấp",
  ACCEPTED: "Đã chấp nhận",
  REJECTED: "Từ chối",
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
  REFUNDED: "Đã hoàn tiền",
  PARTIALLY_REFUNDED: "Hoàn một phần",
  ON_HOLD: "Tạm giữ",
  OPEN: "Đang mở",
  IN_REVIEW: "Đang xem xét",
  RESOLVED: "Đã giải quyết",
  ENDED: "Đã kết thúc",
};

/** Nhãn riêng cho trạng thái PENDING của phiên (chờ thanh toán). */
export const SESSION_STATUS_LABELS: Record<string, string> = { ...MENTORING_STATUS_LABELS, PENDING: "Chờ thanh toán" };

/** Màu badge theo trạng thái (cùng lớp CSS với StatusBadge). */
export function mentoringTone(status: string): "good" | "bad" | "warn" | "neutral" {
  if (["CONFIRMED", "COMPLETED", "ACCEPTED", "SUCCESS"].includes(status)) return "good";
  if (["CANCELLED", "REJECTED", "FAILED", "NO_SHOW_MENTEE", "NO_SHOW_MENTOR", "DISPUTED", "EXPIRED"].includes(status)) return "bad";
  if (["PENDING", "AWAITING_ATTENDANCE", "ON_HOLD", "PARTIALLY_REFUNDED", "OPEN", "IN_REVIEW"].includes(status)) return "warn";
  return "neutral";
}

/** US-12 — nhãn câu trả lời xác nhận tham dự. */
export const ATTENDANCE_LABELS: Record<AttendanceAnswer, string> = {
  HELD: "Phiên đã diễn ra",
  MENTOR_NO_SHOW: "Mentor vắng mặt",
  MENTEE_NO_SHOW: "Mentee vắng mặt",
  CANCELLED_ON_CALL: "Huỷ trong buổi gọi",
};

/** Câu trả lời mỗi bên được chọn (không tự báo mình vắng mặt). */
export const ATTENDANCE_CHOICES: Record<"MENTEE" | "MENTOR", AttendanceAnswer[]> = {
  MENTEE: ["HELD", "MENTOR_NO_SHOW", "CANCELLED_ON_CALL"],
  MENTOR: ["HELD", "MENTEE_NO_SHOW", "CANCELLED_ON_CALL"],
};

export const ATTENDANCE_RESOLUTION_LABELS: Record<AttendanceResolution, string> = {
  BOTH_HELD: "cả hai xác nhận đã diễn ra",
  HELD_ONE_SIDE: "một bên xác nhận đã diễn ra, bên kia không phản hồi trong 48 giờ",
  NO_ANSWER: "không bên nào phản hồi trong 48 giờ",
  MENTEE_NO_SHOW_REPORTED: "mentor báo mentee vắng mặt, mentee không phản hồi",
  MENTOR_NO_SHOW_REPORTED: "mentee báo mentor vắng mặt, mentor không phản hồi",
  CONFLICT: "hai bên xác nhận khác nhau",
  CANCELLED_ON_CALL: "huỷ trong buổi gọi",
  DISPUTE_RESOLVED: "quản trị viên kết luận tranh chấp",
};

// ---- US-31 — kết thúc mentoring ----

export const END_REASON_LABELS: Record<EndReason, string> = {
  GOAL_REACHED: "Đã đạt mục tiêu",
  NO_LONGER_NEEDED: "Không còn nhu cầu",
  NOT_A_FIT: "Không phù hợp",
  OTHER: "Lý do khác",
  INACTIVE: "Không hoạt động (hệ thống)",
};
export const END_REASONS: Exclude<EndReason, "INACTIVE">[] = ["GOAL_REACHED", "NO_LONGER_NEEDED", "NOT_A_FIT", "OTHER"];

// ---- US-32 — tranh chấp ----

export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  NO_SHOW: "Vắng mặt",
  QUALITY: "Chất lượng phiên",
  BEHAVIOR: "Thái độ / hành vi",
  PAYMENT: "Thanh toán",
  OTHER: "Khác",
};
export const DISPUTE_TYPES = Object.keys(DISPUTE_TYPE_LABELS) as DisputeType[];

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
  FULL_REFUND: "Hoàn 100% cho mentee",
  PARTIAL_REFUND: "Hoàn một phần",
  NO_REFUND: "Không hoàn tiền (trả mentor)",
  WARNING: "Cảnh cáo mentor (không hoàn)",
  SUSPEND: "Hoàn 100% + khoá mentor",
};
export const DISPUTE_OUTCOMES = Object.keys(DISPUTE_OUTCOME_LABELS) as DisputeOutcome[];

export const DISPUTE_DESCRIPTION_MIN = 20;
export const DISPUTE_DESCRIPTION_MAX = 2000;
export const DISPUTE_MAX_LINKS = 5;
/** Phiên mở được báo cáo sự cố (trong 7 ngày sau giờ kết thúc). */
export const DISPUTE_OPENABLE = ["COMPLETED", "NO_SHOW_MENTEE", "NO_SHOW_MENTOR", "AWAITING_ATTENDANCE"];
export const DISPUTE_WINDOW_MS = 7 * 24 * 3600 * 1000;

// ---- US-14 — form yêu cầu mentoring ----

export const GOAL_MIN = 50;
export const GOAL_MAX = 1000;

export const FREQUENCY_LABELS: Record<RequestFrequency, string> = {
  WEEKLY: "Hằng tuần",
  BIWEEKLY: "2 tuần một lần",
  MONTHLY: "Hằng tháng",
  ONE_OFF: "Một lần",
};

export const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as RequestFrequency[];

export const EXPECTED_DURATIONS: ExpectedDurationMonths[] = [1, 3, 6];

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  FULL: "Đã nhận đủ mentee",
  NOT_MY_EXPERTISE: "Không đúng chuyên môn",
  SCHEDULE: "Lịch không phù hợp",
  OTHER: "Lý do khác",
};

export const REJECT_REASONS = Object.keys(REJECT_REASON_LABELS) as RejectReason[];

export const LEVEL_LABELS: Record<string, string> = { BEGINNER: "Mới bắt đầu", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" };

// US-33 — nhắn tin
export const MESSAGE_MAX = 2000;

export const MESSAGE_REPORT_REASON_LABELS: Record<MessageReportReason, string> = {
  SPAM: "Spam / quảng cáo",
  HARASSMENT: "Quấy rối, xúc phạm",
  OFF_PLATFORM_PAYMENT: "Đề nghị giao dịch ngoài nền tảng",
  OTHER: "Lý do khác",
};

export const MESSAGE_REPORT_REASONS = Object.keys(MESSAGE_REPORT_REASON_LABELS) as MessageReportReason[];

export const MESSAGE_REPORT_OUTCOME_LABELS: Record<MessageReportOutcome, string> = {
  DISMISSED: "Không vi phạm",
  WARNED: "Đã cảnh cáo người gửi",
};
