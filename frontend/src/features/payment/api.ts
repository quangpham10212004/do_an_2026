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
  TopupRefundRequest,
  Transaction,
  TransactionStatus,
  Uuid,
  Wallet,
  WalletEntry,
  WalletRefundEligibility,
} from "@/types";

/** US-56 — cổng thanh toán chuyển hướng. */
export type RedirectProvider = "MOMO" | "VNPAY";

export const PROVIDER_LABELS: Record<RedirectProvider, string> = { MOMO: "MoMo", VNPAY: "VNPay" };

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
  /** US-56 — redirect = cổng chuyển hướng đang bật ("MOMO" / "VNPAY") hoặc null → dùng form thẻ sandbox. */
  methods: () => api<{ redirect: RedirectProvider | null; sandboxCard: boolean }>("/api/payment/methods"),
  /** US-56 — tạo giao dịch PENDING + link của cổng; trình duyệt chuyển sang paymentUrl. */
  checkout: (sessionId: Uuid, amount: number) =>
    api<{ transactionId: Uuid; provider: RedirectProvider; paymentUrl: string }>("/api/payment/checkout", { method: "POST", body: { sessionId, amount } }),
  /** US-56 — trang return gửi lại nguyên query string cổng trả về; server kiểm chữ ký rồi hỏi cổng trạng thái thật. */
  confirmReturn: (provider: string, search: string) =>
    api<Transaction>(`/api/payment/${encodeURIComponent(provider)}/return${search.startsWith("?") ? search : `?${search}`}`),
  transaction: (id: Uuid) => api<Transaction>(`/api/payment/transactions/${id}`),
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

  // ---- Bản chốt v2.0 §8: ví ----
  wallet: () => api<Wallet>("/api/payment/wallet"),
  walletEntries: (page = 0, size = 20) => api<PageResponse<WalletEntry>>(`/api/payment/wallet/entries?page=${page}&size=${size}`),
  /** Nạp ví bằng form thẻ sandbox — trả giao dịch (SUCCESS | FAILED) ngay. */
  topupWithCard: (amount: number, card: CardInput) =>
    api<Transaction>("/api/payment/wallet/topups", { method: "POST", body: { amount, provider: "SANDBOX", card } }),
  /** Nạp ví qua cổng chuyển hướng (MoMo / VNPay): trả link, ví được cộng khi cổng xác nhận. */
  topupWithGateway: (amount: number, provider: RedirectProvider) =>
    api<{ transactionId: Uuid; provider: RedirectProvider; paymentUrl: string }>("/api/payment/wallet/topups", { method: "POST", body: { amount, provider } }),
  /** Trả học phí của phiên đang chờ từ ví (khuyến mãi trước, thiếu thì tiền nạp). */
  payFromWallet: (sessionId: Uuid) => api<Transaction>("/api/payment/wallet/pay", { method: "POST", body: { sessionId } }),
  reactivateWallet: () => api<void>("/api/payment/wallet/reactivate", { method: "POST" }),
  refundEligibility: () => api<WalletRefundEligibility>("/api/payment/wallet/topup-refund/eligibility"),
  requestTopupRefund: (amount: number, exceptionReason?: string) =>
    api<TopupRefundRequest>("/api/payment/wallet/topup-refund", { method: "POST", body: { amount, exceptionReason: exceptionReason || undefined } }),
  myTopupRefunds: () => api<TopupRefundRequest[]>("/api/payment/wallet/topup-refund"),
  adminTopupRefunds: (status = "PENDING") => api<TopupRefundRequest[]>(`/api/payment/wallet/admin/topup-refunds?status=${status}`),
  decideTopupRefund: (id: Uuid, decision: "APPROVE" | "REJECT", reason: string) =>
    api<TopupRefundRequest>(`/api/payment/wallet/admin/topup-refunds/${id}/decide`, { method: "POST", body: { decision, reason } }),
  grantPromo: (userId: Uuid, amount: number, reason: string) =>
    api<{ lotId: Uuid }>(`/api/payment/wallet/admin/${userId}/promo`, { method: "POST", body: { amount, reason } }),
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
  PAYMENT_CANCELLED: "Bạn đã huỷ thanh toán",
  PAYMENT_EXPIRED: "Hết thời gian thanh toán",
  PAYMENT_FAILED: "Cổng thanh toán báo không thành công",
  MOMO_UNAVAILABLE: "Không kết nối được MoMo",
  MOMO_1002: "Ngân hàng phát hành từ chối giao dịch",
  MOMO_1004: "Vượt hạn mức thanh toán",
  MOMO_1017: "Giao dịch đã bị huỷ",
  VNPAY_UNAVAILABLE: "Không kết nối được VNPay",
  SESSION_DISPUTED: "Phiên đang tranh chấp",
  INSUFFICIENT_FUNDS_WALLET: "Số dư ví không đủ",
  CASH_CAP_EXCEEDED: "Vượt trần tiền nạp khả dụng",
  REFUND_WINDOW_CLOSED: "Đã quá 7 ngày kể từ lần nạp gần nhất",
  REFUND_LIMIT_REACHED: "Đã đạt số yêu cầu hoàn tiền tối đa trong tháng",
  REFUND_AMOUNT_EXCEEDED: "Vượt mức hoàn tối đa",
  WALLET_FROZEN: "Ví đang bị đóng băng",
  WALLET_DORMANT: "Ví không hoạt động quá 12 tháng — hãy kích hoạt lại",
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
