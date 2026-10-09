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

// US-37 (PRD-PROF-6) — mọi giờ lưu UTC, hiển thị theo múi giờ trong hồ sơ của người xem (mặc định giờ Việt Nam).
const TZ_KEY = "mmp-timezone";
export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";
let displayTimeZone: string | null = null;

/** Múi giờ hiển thị hiện tại (đọc từ localStorage ở lần đầu; trình duyệt chưa có thì dùng giờ Việt Nam). */
export function getDisplayTimeZone(): string {
  if (displayTimeZone) return displayTimeZone;
  try {
    displayTimeZone = (typeof window !== "undefined" && window.localStorage.getItem(TZ_KEY)) || DEFAULT_TIME_ZONE;
  } catch {
    displayTimeZone = DEFAULT_TIME_ZONE;
  }
  return displayTimeZone;
}

/** Gọi sau khi tải / đổi múi giờ trong hồ sơ; các trang đang mở vẽ lại qua sự kiện "mmp-timezone-changed". */
export function setDisplayTimeZone(tz: string | null | undefined): void {
  const next = tz || DEFAULT_TIME_ZONE;
  if (next === displayTimeZone) return;
  displayTimeZone = next;
  try {
    window.localStorage.setItem(TZ_KEY, next);
  } catch {
    /* chế độ riêng tư: chỉ giữ trong bộ nhớ */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mmp-timezone-changed"));
}

export function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timeZone || getDisplayTimeZone(),
  });
}

/** "19:00 20/11/2026 (Europe/Paris)" — giờ địa phương của bên kia, dùng cho tooltip. */
export function formatInZone(value: string | null | undefined, timeZone: string | null | undefined): string {
  if (!value || !timeZone) return "";
  return `${formatDateTime(value, timeZone)} (${timeZone})`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Ngày thuần "YYYY-MM-DD" (vd. hạn action item) không đổi múi giờ.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(value).toLocaleDateString("vi-VN", { timeZone: getDisplayTimeZone() });
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
  // US-27 — mentor bị admin tạm ngưng
  SUSPENDED: "Tạm ngưng",
  // US-28 — trạng thái mục tiêu trong không gian mentoring
  TODO: "Chưa bắt đầu",
  DONE: "Đã xong",
  RETAKE_REQUESTED: "Yêu cầu phỏng vấn lại",
  REQUEST_RETAKE: "Yêu cầu làm lại",
  PROMPT_INJECTION: "Nghi chèn lệnh cho AI",
  COPIED_ANSWER: "Dán nội dung dài",
};

export const ROLE_LABELS: Record<Role, string> = { MENTEE: "Mentee", MENTOR: "Mentor", ADMIN: "Quản trị viên" };

export type StatusTone = "good" | "bad" | "warn" | "neutral";

export function statusTone(status: string): StatusTone {
  if (["SUCCESS", "CONFIRMED", "ACCEPTED", "APPROVED", "QUALIFIED", "ACTIVE", "COMPLETED", "APPROVE", "DONE"].includes(status)) return "good";
  if (["FAILED", "REJECTED", "CANCELLED", "LOCKED", "REJECT", "NO_SHOW_MENTEE", "NO_SHOW_MENTOR", "DISPUTED", "EXPIRED", "SUSPENDED"].includes(status)) return "bad";
  if (["PENDING", "PENDING_REVIEW", "IN_PROGRESS", "PENDING_INTERVIEW", "REGISTERED", "NEEDS_REVIEW", "AWAITING_ATTENDANCE", "ON_HOLD", "PARTIALLY_REFUNDED", "OPEN", "IN_REVIEW", "RETAKE_REQUESTED", "REQUEST_RETAKE", "PROMPT_INJECTION", "COPIED_ANSWER"].includes(status)) return "warn";
  return "neutral";
}
