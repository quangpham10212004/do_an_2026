import type { SessionDuration, SessionType } from "@/types";

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

/** Nhãn trạng thái riêng của mentoring/payment (bổ sung cho STATUS_LABELS chung). */
export const MENTORING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ xử lý",
  CONFIRMED: "Đã xác nhận",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

/** Màu badge theo trạng thái (cùng lớp CSS với StatusBadge). */
export function mentoringTone(status: string): "good" | "bad" | "warn" | "neutral" {
  if (["CONFIRMED", "COMPLETED", "ACCEPTED", "SUCCESS"].includes(status)) return "good";
  if (["CANCELLED", "REJECTED", "FAILED"].includes(status)) return "bad";
  if (["PENDING"].includes(status)) return "warn";
  return "neutral";
}
