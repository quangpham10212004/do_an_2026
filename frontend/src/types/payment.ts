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

/** US-25 — kiểu dòng sổ thu nhập mentor (append-only). */
export type LedgerEntryType = "EARNING_PENDING" | "EARNING_AVAILABLE" | "REVERSAL" | "PAYOUT";

/** US-25 — GET /api/payment/earnings/summary */
export interface EarningSummary {
  pending: number;
  available: number;
  paidOut: number;
  reversed: number;
  earned: number;
  currency: string;
  releaseDelayHours: number;
}

export interface LedgerEntry {
  id: Uuid;
  type: LedgerEntryType;
  amount: number;
  refundId: Uuid | null;
  createdAt: IsoDateTime;
}

/** US-25 — GET /api/payment/earnings (1 dòng / phiên có phí). */
export interface EarningRow {
  sessionId: Uuid;
  transactionId: Uuid;
  amount: number;
  mentorEarning: number;
  transactionStatus: TransactionStatus;
  pending: number;
  available: number;
  paidOut: number;
  reversed: number;
  finalState: string | null;
  endedAt: IsoDateTime | null;
  releaseAt: IsoDateTime | null;
  releasedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  entries: LedgerEntry[];
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

// US-42 (PRD-PAY-4..6) — rút tiền, biên lai
export type PayoutStatus = "REQUESTED" | "PAID" | "REJECTED";

export interface BankAccount {
  bankName: string;
  /** "••••1234" */
  accountNumberMasked: string;
  holderName: string;
  updatedAt: string;
}

export interface Payout {
  id: string;
  mentorId: string;
  mentorName: string | null;
  amount: number;
  status: PayoutStatus;
  bankName: string;
  accountNumberMasked: string;
  /** Chỉ admin nhận (để chuyển khoản). */
  accountNumber: string | null;
  holderName: string;
  reference: string | null;
  note: string | null;
  requestedAt: string;
  decidedAt: string | null;
}

export interface PayoutOverview {
  available: number;
  requested: number;
  minimum: number;
  canRequest: boolean;
  bankAccount: BankAccount | null;
  openPayout: Payout | null;
  history: Payout[];
}

export interface Receipt {
  receiptNumber: string;
  transactionId: string;
  status: string;
  paidAt: string;
  sessionId: string;
  sessionStart: string | null;
  durationMinutes: number | null;
  payerId: string;
  payerName: string;
  mentorId: string;
  mentorName: string;
  amount: number;
  fee: number;
  mentorEarning: number;
  currency: string;
  provider: string;
  providerReference: string | null;
  refunded: number;
  netPaid: number;
  refunds: { receiptNumber: string; refundId: string; amount: number; reason: string | null; createdAt: string }[];
}
