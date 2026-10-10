import { api, apiBlob } from "@/lib/api";
import type {
  BankAccount,
  CardInput,
  Payout,
  PayoutOverview,
  PayoutStatus,
  Receipt,
  EarningRow,
  EarningSummary,
  MyReferral,
  PageResponse,
  PaymentStats,
  Referral,
  Transaction,
  TransactionStatus,
  Uuid,
} from "@/types";

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
  transactions: () => api<Transaction[]>("/api/payment/transactions"),
  sessionTransactions: (sessionId: Uuid) => api<Transaction[]>(`/api/payment/sessions/${sessionId}/transactions`),
  myReferral: () => api<MyReferral>("/api/payment/referrals/me"),
  /** US-25 — thu nhập của mentor đang đăng nhập. */
  earningSummary: () => api<EarningSummary>("/api/payment/earnings/summary"),
  earnings: () => api<EarningRow[]>("/api/payment/earnings"),
  // US-42 — rút tiền, biên lai, CSV
  payoutOverview: () => api<PayoutOverview>("/api/payment/payouts/overview"),
  saveBankAccount: (body: { bankName: string; accountNumber: string; holderName: string }) =>
    api<BankAccount>("/api/payment/bank-account", { method: "PUT", body }),
  requestPayout: () => api<Payout>("/api/payment/payouts", { method: "POST" }),
  receipt: (transactionId: Uuid) => api<Receipt>(`/api/payment/transactions/${transactionId}/receipt`),
  downloadEarningsCsv: async (month: string) => {
    const blob = await apiBlob(`/api/payment/earnings/export?month=${month}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thu-nhap-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  adminPayouts: (status: PayoutStatus | "" = "REQUESTED") => api<Payout[]>(`/api/payment/admin/payouts?status=${status}`),
  markPayoutPaid: (id: Uuid, reference: string, note?: string) =>
    api<Payout>(`/api/payment/admin/payouts/${id}/paid`, { method: "POST", body: { reference, note } }),
  rejectPayout: (id: Uuid, reason: string) =>
    api<Payout>(`/api/payment/admin/payouts/${id}/reject`, { method: "POST", body: { reason } }),
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
  MENTOR_NO_SHOW: "Mentor vắng mặt",
  CANCELLED_ON_CALL: "Huỷ trong buổi gọi",
  DISPUTE_FULL_REFUND: "Tranh chấp: hoàn toàn bộ",
  DISPUTE_PARTIAL_REFUND: "Tranh chấp: hoàn một phần",
  DISPUTE_SUSPEND: "Tranh chấp: mentor bị khoá",
  MENTOR_SUSPENDED: "Mentor bị khoá",
};

/** US-25 — nhãn dòng sổ thu nhập. */
export const LEDGER_TYPE_LABELS: Record<string, string> = {
  EARNING_PENDING: "Chờ giải phóng",
  EARNING_AVAILABLE: "Đã giải phóng",
  REVERSAL: "Thu hồi (hoàn tiền)",
  PAYOUT: "Đã chi trả",
};

export const paymentReasonLabel = (reason: string | null | undefined): string =>
  reason ? PAYMENT_REASON_LABELS[reason] || reason : "";

/** "15%" từ 0.15. */
export const feePercent = (rate: number | null | undefined): string => `${Math.round(Number(rate || 0) * 10000) / 100}%`;
