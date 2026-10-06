import type { IsoDateTime, Uuid } from "./common";

// contracts/payment-service.yaml
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
export type ReferralStatus = "REGISTERED" | "QUALIFIED" | "REJECTED";
export type ReferralRejectReason = "REFERRER_IS_SESSION_MENTOR" | "DAILY_LIMIT_EXCEEDED";

export interface Transaction {
  id: Uuid;
  sessionId: Uuid;
  payerId: Uuid;
  mentorId: Uuid;
  amount: number;
  currency: string;
  status: TransactionStatus;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
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
}
