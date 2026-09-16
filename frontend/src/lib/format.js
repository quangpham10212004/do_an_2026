export const DAY_NAMES = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

export function formatMoney(value) {
  const n = Number(value || 0);
  if (n === 0) return "Miễn phí";
  return n.toLocaleString("vi-VN") + " đ";
}

/** Đơn giá theo giờ: "Miễn phí" hoặc "300.000 đ/giờ" (tránh "Miễn phí/giờ"). */
export function formatRate(value) {
  return Number(value || 0) === 0 ? "Miễn phí" : `${formatMoney(value)}/giờ`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("vi-VN");
}

export const STATUS_LABELS = {
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
};

export const ROLE_LABELS = { MENTEE: "Mentee", MENTOR: "Mentor", ADMIN: "Quản trị viên" };

export function statusTone(status) {
  if (["SUCCESS", "CONFIRMED", "ACCEPTED", "APPROVED", "QUALIFIED", "ACTIVE", "COMPLETED", "APPROVE"].includes(status)) return "good";
  if (["FAILED", "REJECTED", "CANCELLED", "LOCKED", "REJECT"].includes(status)) return "bad";
  if (["PENDING", "PENDING_REVIEW", "IN_PROGRESS", "PENDING_INTERVIEW", "REGISTERED", "NEEDS_REVIEW"].includes(status)) return "warn";
  return "neutral";
}
