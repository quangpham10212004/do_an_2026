import { api } from "@/lib/api";

// payment-service (Thắng)
export const paymentApi = {
  charge: (sessionId, amount, card) => api("/api/payment/charge", { method: "POST", body: { sessionId, amount, card } }),
  transactions: () => api("/api/payment/transactions"),
  sessionTransactions: (sessionId) => api(`/api/payment/sessions/${sessionId}/transactions`),
  myReferral: () => api("/api/payment/referrals/me"),
  adminTransactions: (status = "", page = 0) => api(`/api/payment/admin/transactions?status=${status}&page=${page}`),
  adminStats: () => api("/api/payment/admin/stats"),
  adminReferrals: () => api("/api/payment/admin/referrals"),
};

export const TEST_CARDS = [
  ["4242 4242 4242 4242", "Thanh toán thành công"],
  ["4000 0000 0000 0002", "Thẻ bị từ chối"],
  ["4000 0000 0000 9995", "Không đủ số dư"],
];
