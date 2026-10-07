import type { AttendanceAnswer, AttendanceResolution, SessionDuration, SessionType } from "@/types";

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
};

/** Nhãn riêng cho trạng thái PENDING của phiên (chờ thanh toán). */
export const SESSION_STATUS_LABELS: Record<string, string> = { ...MENTORING_STATUS_LABELS, PENDING: "Chờ thanh toán" };

/** Màu badge theo trạng thái (cùng lớp CSS với StatusBadge). */
export function mentoringTone(status: string): "good" | "bad" | "warn" | "neutral" {
  if (["CONFIRMED", "COMPLETED", "ACCEPTED", "SUCCESS"].includes(status)) return "good";
  if (["CANCELLED", "REJECTED", "FAILED", "NO_SHOW_MENTEE", "NO_SHOW_MENTOR", "DISPUTED", "EXPIRED"].includes(status)) return "bad";
  if (["PENDING", "AWAITING_ATTENDANCE", "ON_HOLD", "PARTIALLY_REFUNDED"].includes(status)) return "warn";
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
};
