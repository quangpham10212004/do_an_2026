import { api } from "@/lib/api";
import { paymentApi } from "@/features/payment/api";
import type { Transaction, Uuid } from "@/types";

export const VOUCHER_PAY_SUPPORTED = true;

/** Wrapper cho paymentApi.payFromWallet (không sửa features/payment/api.ts). */
export function payFromWalletWithVoucher(sessionId: Uuid, voucherId: string | null): Promise<Transaction> {
  if (!VOUCHER_PAY_SUPPORTED || !voucherId) return paymentApi.payFromWallet(sessionId);
  return api<Transaction>("/api/payment/wallet/pay", { method: "POST", body: { sessionId, voucherId } });
}

/** Nơi quay lại sau khi nạp ví qua cổng chuyển hướng (trang return đọc, xoá khi nạp thành công). */
const BACK_KEY = "mh-pay-back";
export function rememberPayBack(path: string) {
  try { window.sessionStorage.setItem(BACK_KEY, path); } catch { /* bỏ qua: trình duyệt chặn lưu trữ */ }
}
export function peekPayBack(): string | null {
  try {
    const v = window.sessionStorage.getItem(BACK_KEY);
    return v && v.startsWith("/payment/") ? v : null;
  } catch {
    return null;
  }
}
export function clearPayBack() {
  try { window.sessionStorage.removeItem(BACK_KEY); } catch { /* bỏ qua */ }
}
