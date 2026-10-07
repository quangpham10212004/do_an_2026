import type { IsoDateTime, Uuid } from "./common";

// contracts/payment-service.yaml
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "ON_HOLD";

/** US-13 — một lần hoàn tiền (bảng refunds). */
export interface RefundEntry {
  id: Uuid;
  amount: number;
  reason: string | null;
  actorId: Uuid | null;
  createdAt: IsoDateTime;
}
export type ReferralStatus = "REGISTERED" | "QUALIFIED" | "REJECTED";
export type ReferralRejectReason = "REFERRER_IS_SESSION_MENTOR" | "DAILY_LIMIT_EXCEEDED";

export interface Transaction {
  id: Uuid;
  sessionId: Uuid;
  payerId: Uuid;
  mentorId: Uuid;
  amount: number;
  /** US-13 — phí nền tảng chốt lúc charge. */
  fee: number;
  /** US-13 — mentor nhận = amount − fee. */
  mentorEarning: number;
  feeRate: number;
  refundedAmount: number;
  currency: string;
  status: TransactionStatus;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  holdReason: string | null;
  refunds: RefundEntry[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CardInput {
  cardNumber: string;
  cardHolder?: string;
  expiry: string;
  cvv: string;
}

export interface Referral {
  id: Uuid;
  referrerId: Uuid;
  refereeId: Uuid;
  code: string;
  status: ReferralStatus;
  rejectReason: ReferralRejectReason | null;
  createdAt: IsoDateTime;
  qualifiedAt: IsoDateTime | null;
}

export interface RewardEntry {
  id: Uuid;
  points: number;
  reason: string;
  createdAt: IsoDateTime;
}

export interface MyReferral {
  code: string;
  shareUrl: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  pointsBalance: number;
  rewardPointsPerReferral: number;
  minQualifyingAmount: number;
  referrals: Referral[];
  rewards: RewardEntry[];
}

export interface PaymentStats {
  successCount: number;
  failedCount: number;
  refundedCount: number;
  totalRevenue: number;
  partiallyRefundedCount: number;
  onHoldCount: number;
  totalPlatformFee: number;
}
