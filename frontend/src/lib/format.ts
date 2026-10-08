import type { Role } from "@/types";

export const DAY_NAMES = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  if (n === 0) return "Miễn phí";
  return n.toLocaleString("vi-VN") + " đ";
}

/** Số tiền VND luôn hiển thị số (0 → "0 đ"), dùng cho số dư / thu nhập. */
export function formatVnd(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString("vi-VN") + " đ";
}

/** Đơn giá theo giờ: "Miễn phí" hoặc "300.000 đ/giờ" (tránh "Miễn phí/giờ"). */
export function formatRate(value: number | string | null | undefined): string {
  return Number(value || 0) === 0 ? "Miễn phí" : `${formatMoney(value)}/giờ`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("vi-VN");
}

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ xử lý",
  ACCEPTED: "Đã chấp nhận",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
  COMPLETED: "Hoàn thành",
  CONFIRMED: "Đã xác nhận",
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
  REFUNDED: "Đã hoàn tiền",
  IN_PROGRESS: "Đang diễn ra",
  PENDING_REVIEW: "Chờ admin duyệt",
  APPROVED: "Đã duyệt",
  PENDING_INTERVIEW: "Chưa phỏng vấn",
  REGISTERED: "Đã đăng ký",
  QUALIFIED: "Hợp lệ",
  ACTIVE: "Hoạt động",
  LOCKED: "Đã khoá",
  UPDATED: "Đã cập nhật",
  UNCHANGED: "Không đổi",
  APPROVE: "Nên duyệt",
  REJECT: "Không nên duyệt",
  NEEDS_REVIEW: "Cần xem xét",
  AWAITING_ATTENDANCE: "Chờ xác nhận tham dự",
  EXPIRED: "Hết hạn",
  NO_SHOW_MENTEE: "Mentee vắng mặt",
  NO_SHOW_MENTOR: "Mentor vắng mặt",
  DISPUTED: "Đang tranh chấp",
  PARTIALLY_REFUNDED: "Hoàn một phần",
  ON_HOLD: "Tạm giữ",
  OPEN: "Đang mở",
  IN_REVIEW: "Đang xem xét",
  RESOLVED: "Đã giải quyết",
  ENDED: "Đã kết thúc",
};

export const ROLE_LABELS: Record<Role, string> = { MENTEE: "Mentee", MENTOR: "Mentor", ADMIN: "Quản trị viên" };

export type StatusTone = "good" | "bad" | "warn" | "neutral";

export function statusTone(status: string): StatusTone {
  if (["SUCCESS", "CONFIRMED", "ACCEPTED", "APPROVED", "QUALIFIED", "ACTIVE", "COMPLETED", "APPROVE"].includes(status)) return "good";
  if (["FAILED", "REJECTED", "CANCELLED", "LOCKED", "REJECT", "NO_SHOW_MENTEE", "NO_SHOW_MENTOR", "DISPUTED", "EXPIRED"].includes(status)) return "bad";
  if (["PENDING", "PENDING_REVIEW", "IN_PROGRESS", "PENDING_INTERVIEW", "REGISTERED", "NEEDS_REVIEW", "AWAITING_ATTENDANCE", "ON_HOLD", "PARTIALLY_REFUNDED", "OPEN", "IN_REVIEW"].includes(status)) return "warn";
  return "neutral";
}
