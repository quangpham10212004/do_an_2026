import { api } from "@/lib/api";
import { paymentApi } from "@/features/payment/api";

/** Mã giới thiệu + mã giảm giá (voucher), gọi payment-service. */

export type VoucherStatus = "ACTIVE" | "PENDING" | "USED" | "EXPIRED";

export interface Voucher {
  id: string;
  /** Mã nhập khi thanh toán, ví dụ REF-8H2K-30. */
  code: string;
  amount: number;
  /** Học phí tối thiểu để áp dụng. */
  minOrder: number;
  status: VoucherStatus;
  title: string;
  /** ACTIVE/USED/EXPIRED: hạn dùng. PENDING: null. */
  expiresAt: string | null;
  /** PENDING: ngày mã được giải phóng nếu buổi học không bị hoàn tiền. */
  releaseAt: string | null;
  usedAt: string | null;
  usedNote: string | null;
}

export interface ReferralMentor {
  mentorId: string;
  mentorName: string;
  headline: string;
  rating: number | null;
  sessionsLearned: number;
  code: string;
  shareUrl: string;
  usedCount: number;
}

export interface LockedMentor {
  mentorId: string;
  mentorName: string;
}

export type InviteeStatus = "REGISTERED" | "WAITING" | "UNDER_REVIEW" | "QUALIFIED" | "REJECTED";

export interface ReferredFriend {
  id: string;
  shortId: string;
  mentorName: string;
  status: InviteeStatus;
  at: string;
  /** Số ngày còn chờ thưởng (WAITING). */
  daysLeft: number | null;
  note: string | null;
}

export interface ReferralOverview {
  reward: number;
  pendingDays: number;
  monthlyCap: number;
  qualifiedThisMonth: number;
  activeVouchers: number;
  totalVoucherValue: number;
  codes: ReferralMentor[];
  locked: LockedMentor[];
  friends: ReferredFriend[];
}

export type InviteErrorCode = "NOT_FOUND" | "ALREADY_LEARNED" | "SELF_REFERRAL" | "NOT_FIRST_SESSION";

export interface InviteInfo {
  code: string;
  valid: boolean;
  errorCode: InviteErrorCode | null;
  inviterName: string | null;
  mentor: { id: string; name: string; headline: string; rating: number | null; reviewCount: number; hourlyRate: number; verified: boolean } | null;
  /** Lời nhắn người giới thiệu để lại (nếu có). */
  quote: string | null;
}

export interface VoucherQuote {
  voucherId: string | null;
  tuition: number;
  discount: number;
  payable: number;
  /** Lý do mã không dùng được (hiện ngay dưới mã). */
  reason: string | null;
}

export function voucherQuoteLocal(v: Voucher | null, tuition: number): VoucherQuote {
  if (!v) return { voucherId: null, tuition, discount: 0, payable: tuition, reason: null };
  let reason: string | null = null;
  if (v.status === "USED") reason = "Mã này đã được dùng.";
  else if (v.status === "EXPIRED" || (v.expiresAt && new Date(v.expiresAt).getTime() < Date.now())) reason = "Mã đã hết hạn.";
  else if (v.status === "PENDING") reason = "Mã chưa được giải phóng.";
  else if (tuition < v.minOrder) reason = `Chỉ áp dụng cho phiên từ ${v.minOrder.toLocaleString("vi-VN")} đ.`;
  const discount = reason ? 0 : Math.min(v.amount, tuition);
  return { voucherId: v.id, tuition, discount, payable: tuition - discount, reason };
}

// ---------------------------------------------------------------- API

export const referralApi = {
  /** Tổng quan giới thiệu: ghép mã theo mentor từ GET /api/payment/referrals/me với kho voucher. */
  async overview(): Promise<ReferralOverview> {
    const [me, vouchers] = await Promise.all([paymentApi.myReferral(), referralApi.vouchers()]);
    const used = (mentorId: string) => me.referrals.filter((r) => r.mentorId === mentorId).length;
    return {
      reward: me.reward, pendingDays: me.pendingDays, monthlyCap: me.monthlyCap, qualifiedThisMonth: me.qualifiedThisMonth,
      activeVouchers: vouchers.filter((v) => v.status === "ACTIVE").length,
      totalVoucherValue: vouchers.filter((v) => v.status !== "EXPIRED").reduce((sum, v) => sum + v.amount, 0),
      codes: me.codes.map((c) => ({ mentorId: c.mentorId, mentorName: c.mentorName, headline: "", rating: null, sessionsLearned: 0, code: c.code, shareUrl: c.shareUrl, usedCount: used(c.mentorId) })),
      locked: [],
      friends: me.referrals.map((r) => ({
        id: r.id, shortId: r.refereeId.slice(0, 4), mentorName: me.codes.find((c) => c.mentorId === r.mentorId)?.mentorName ?? "",
        status: r.status === "QUALIFIED" ? "QUALIFIED" : r.status === "REJECTED" || r.status === "CAPPED" ? "REJECTED" : r.status === "UNDER_REVIEW" ? "UNDER_REVIEW" : "WAITING",
        at: r.createdAt, daysLeft: null, note: r.rejectReason,
      })),
    };
  },

  /** Người được mời xem trước mã: GET /api/payment/referrals/codes/{code} (công khai). */
  lookupCode: (code: string): Promise<InviteInfo> => api<InviteInfo>(`/api/payment/referrals/codes/${encodeURIComponent(code.trim())}`),

  /** Kho voucher của tôi: GET /api/payment/vouchers/me. */
  vouchers: (): Promise<Voucher[]> => api<Voucher[]>("/api/payment/vouchers/me"),

  /** Tính giảm giá cho một học phí: POST /api/payment/vouchers/quote { voucherId | code, tuition }. */
  quote: (input: { voucherId?: string; code?: string; tuition: number }): Promise<VoucherQuote> =>
    api<VoucherQuote>("/api/payment/vouchers/quote", { method: "POST", body: input }),
};
