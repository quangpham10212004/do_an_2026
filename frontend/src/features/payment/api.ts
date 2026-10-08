import { api } from "@/lib/api";
import type { CardInput, MyReferral, PageResponse, PaymentStats, Referral, Transaction, TransactionStatus, Uuid } from "@/types";

// payment-service (Thắng)
export const paymentApi = {
  /**
   * US-13 — `idempotencyKey`: 1 UUID cho mỗi lần checkout (gửi lại cùng key khi retry → payment-service trả kết quả
   * lần đầu, không charge 2 lần). Sinh key mới bằng newIdempotencyKey() sau khi có kết quả.
   */
  charge: (sessionId: Uuid, amount: number, card: CardInput, idempotencyKey: string) =>
    api<Transaction>("/api/payment/charge", {
      method: "POST",
      body: { sessionId, amount, card },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  /** Thanh toán một gói buổi (cùng quy tắc Idempotency-Key như charge phiên lẻ). */
  chargePackage: (packageId: Uuid, amount: number, card: CardInput, idempotencyKey: string) =>
    api<Transaction>("/api/payment/charge", {
      method: "POST",
      body: { packageId, amount, card },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  packageTransactions: (packageId: Uuid) => api<Transaction[]>(`/api/payment/packages/${packageId}/transactions`),
  transactions: () => api<Transaction[]>("/api/payment/transactions"),
  sessionTransactions: (sessionId: Uuid) => api<Transaction[]>(`/api/payment/sessions/${sessionId}/transactions`),
  myReferral: () => api<MyReferral>("/api/payment/referrals/me"),
  adminTransactions: (status: TransactionStatus | "" = "", page = 0) =>
    api<PageResponse<Transaction>>(`/api/payment/admin/transactions?status=${status}&page=${page}`),
  adminStats: () => api<PaymentStats>("/api/payment/admin/stats"),
  adminReferrals: () => api<Referral[]>("/api/payment/admin/referrals"),
};

/** UUID v4 cho Idempotency-Key (crypto.randomUUID khi có, fallback getRandomValues). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Thẻ thử của cổng sandbox: [số thẻ, kết quả mong đợi]. */
export const TEST_CARDS: ReadonlyArray<readonly [string, string]> = [
  ["4242 4242 4242 4242", "Thanh toán thành công"],
  ["4000 0000 0000 0002", "Thẻ bị từ chối"],
  ["4000 0000 0000 9995", "Không đủ số dư"],
];

/** Nhãn lý do thất bại / hoàn tiền thường gặp. */
export const PAYMENT_REASON_LABELS: Record<string, string> = {
  CARD_DECLINED: "Thẻ bị từ chối",
  INSUFFICIENT_FUNDS: "Không đủ số dư",
  INVALID_CARD_NUMBER: "Số thẻ không hợp lệ",
  INVALID_CVV: "CVV không hợp lệ",
  CARD_EXPIRED: "Thẻ hết hạn",
  DUPLICATE_PAYMENT: "Thanh toán trùng",
  SESSION_DISPUTED: "Phiên đang tranh chấp",
  SESSION_CANCELLED_BY_MENTEE: "Mentee huỷ phiên",
  SESSION_CANCELLED_BY_MENTOR: "Mentor huỷ phiên",
  SESSION_CANCELLED_BY_SYSTEM: "Hệ thống huỷ phiên",
  SESSION_ALREADY_CANCELLED: "Phiên đã huỷ trước khi thanh toán xong",
  PACKAGE_CANCELLED: "Huỷ gói buổi",
  PACKAGE_EXPIRED: "Gói buổi hết hạn",
  PACKAGE_UNUSED_SESSIONS: "Hoàn buổi chưa dùng",
  RELATIONSHIP_ENDED: "Kết thúc mentoring",
  MENTOR_NO_SHOW: "Mentor vắng mặt",
  CANCELLED_ON_CALL: "Huỷ trong buổi gọi",
};

export const paymentReasonLabel = (reason: string | null | undefined): string =>
  reason ? PAYMENT_REASON_LABELS[reason] || reason : "";

/** "15%" từ 0.15. */
export const feePercent = (rate: number | null | undefined): string => `${Math.round(Number(rate || 0) * 10000) / 100}%`;
