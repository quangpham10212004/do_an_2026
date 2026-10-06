import { api } from "@/lib/api";
import type { CardInput, MyReferral, PageResponse, PaymentStats, Referral, Transaction, TransactionStatus, Uuid } from "@/types";

// payment-service (Thắng)
export const paymentApi = {
  charge: (sessionId: Uuid, amount: number, card: CardInput) =>
    api<Transaction>("/api/payment/charge", { method: "POST", body: { sessionId, amount, card } }),
  transactions: () => api<Transaction[]>("/api/payment/transactions"),
  sessionTransactions: (sessionId: Uuid) => api<Transaction[]>(`/api/payment/sessions/${sessionId}/transactions`),
  myReferral: () => api<MyReferral>("/api/payment/referrals/me"),
  adminTransactions: (status: TransactionStatus | "" = "", page = 0) =>
    api<PageResponse<Transaction>>(`/api/payment/admin/transactions?status=${status}&page=${page}`),
  adminStats: () => api<PaymentStats>("/api/payment/admin/stats"),
  adminReferrals: () => api<Referral[]>("/api/payment/admin/referrals"),
};

/** Thẻ thử của cổng sandbox: [số thẻ, kết quả mong đợi]. */
export const TEST_CARDS: ReadonlyArray<readonly [string, string]> = [
  ["4242 4242 4242 4242", "Thanh toán thành công"],
  ["4000 0000 0000 0002", "Thẻ bị từ chối"],
  ["4000 0000 0000 9995", "Không đủ số dư"],
];
