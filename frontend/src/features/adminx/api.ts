import { api } from "@/lib/api";
import type { TransactionStatus, User, Uuid } from "@/types";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export type SuspendDuration = "7d" | "30d" | "permanent";
export const SUSPEND_LABELS: Record<SuspendDuration, string> = { "7d": "7 ngày", "30d": "30 ngày", permanent: "Vĩnh viễn" };

export interface UserExtra {
  /** Mã hiển thị, ví dụ u_8f3a21. */
  code: string;
  /** Số phiên đã học (mentee) hoặc đã dạy (mentor). */
  sessions: number;
  walletBalance: number;
  contactViolations: number;
  /** ISO nếu đang bị đình chỉ có thời hạn; null = vĩnh viễn hoặc không bị đình chỉ. */
  suspendedUntil: string | null;
}

export const userCode = (id: string) => `u_${id.replace(/-/g, "").slice(0, 6)}`;



export interface TxKpis {
  held: { amount: number; sessions: number };
  topupToday: { amount: number; momoPercent: number; vnpayPercent: number };
  failed24h: number;
  promoGranted: { amount: number; codes: number };
}

export interface PayoutKpis {
  paidThisMonth: { count: number; amount: number };
  avgProcessingDays: number | null;
  pending: { count: number; amount: number };
}

export type AdminTxType = "SESSION_HOLD" | "TOPUP" | "REFUND" | "REFERRAL_REWARD";
export const TX_TYPE_LABELS: Record<AdminTxType, string> = {
  SESSION_HOLD: "Giữ tiền phiên",
  TOPUP: "Nạp ví",
  REFUND: "Hoàn tiền phiên",
  REFERRAL_REWARD: "Thưởng giới thiệu",
};

export interface AdminTxRow {
  id: string;
  /** TX-xxxxx */
  code: string;
  createdAt: string;
  type: AdminTxType;
  provider: string | null;
  userId: string | null;
  userName: string;
  /** Có dấu: cộng vào ví dương, trừ âm. */
  amount: number;
  status: TransactionStatus;
  sessionId: string | null;
  failureReason: string | null;
  reference: string | null;

}

export const txCode = (id: string) => `TX-${10000 + (hash(id) % 90000)}`;
export const providerLabel = (p: string | null) => (p === "MOMO" ? "MoMo" : p === "VNPAY" ? "VNPay" : p === "WALLET" ? "Ví" : p === "SANDBOX" ? "Thẻ thử" : p || "");

export function txTypeLabel(r: Pick<AdminTxRow, "type" | "provider">): string {
  const base = TX_TYPE_LABELS[r.type];
  return r.type === "TOPUP" && r.provider ? `${base} · ${providerLabel(r.provider)}` : base;
}


type AuthUserExtra = Pick<UserExtra, "code" | "suspendedUntil"> & { name: string };
type MentoringUserExtra = Pick<UserExtra, "sessions" | "contactViolations">;
type TransactionRow = Omit<AdminTxRow, "code" | "userName">;
type TransactionPage = { items: TransactionRow[]; totalItems: number; totalPages: number };

const idQuery = (ids: string[]) => new URLSearchParams({ ids: ids.join(",") }).toString();
const authUserExtras = (ids: string[]) =>
  api<Record<string, AuthUserExtra>>("/api/auth/admin/users/extras?" + idQuery(ids));

export const adminxApi = {
  async userExtras(users: User[]): Promise<Record<string, UserExtra>> {
    if (!users.length) return {};
    const ids = users.map((user) => user.id);
    const query = idQuery(ids);
    const [accounts, mentoring, balances] = await Promise.all([
      authUserExtras(ids),
      api<Record<string, MentoringUserExtra>>("/api/mentoring/admin/reporting/users?" + query),
      api<Record<string, number>>("/api/payment/admin/reporting/wallets?" + query),
    ]);

    return Object.fromEntries(ids.map((id) => [id, {
      code: accounts[id]?.code ?? userCode(id),
      sessions: mentoring[id]?.sessions ?? 0,
      walletBalance: balances[id] ?? 0,
      contactViolations: mentoring[id]?.contactViolations ?? 0,
      suspendedUntil: accounts[id]?.suspendedUntil ?? null,
    }]));
  },

  resendVerification: (userId: Uuid) =>
    api<void>("/api/auth/admin/users/" + userId + "/resend-verification", { method: "POST" }),

  resetPassword: (userId: Uuid) =>
    api<void>("/api/auth/admin/users/" + userId + "/reset-password", { method: "POST" }),

  suspendUser: (userId: Uuid, duration: SuspendDuration, reason: string) =>
    api<void>("/api/auth/admin/users/" + userId + "/suspension", { method: "POST", body: { duration, reason } }),

  txKpis: () => api<TxKpis>("/api/payment/admin/transactions/kpis"),

  async transactions(status: TransactionStatus | "", page: number) {
    const query = new URLSearchParams({ status, page: String(page) });
    const result = await api<TransactionPage>("/api/payment/admin/transactions/rows?" + query);
    const ids = [...new Set(result.items.flatMap((row) => row.userId ? [row.userId] : []))];
    const names = ids.length ? await authUserExtras(ids) : {};
    const items: AdminTxRow[] = result.items.map((row) => ({
      ...row,
      code: txCode(row.id),
      userName: row.userId ? names[row.userId]?.name ?? userCode(row.userId) : "—",
    }));
    return { ...result, items };
  },

  reconcile: (tx: AdminTxRow) =>
    api<{ status: TransactionStatus }>("/api/payment/admin/transactions/" + tx.id + "/reconcile", { method: "POST" }),

  payoutKpis: () => api<PayoutKpis>("/api/payment/admin/payouts/kpis"),
};

/** Chuẩn hoá tên để so khớp: bỏ dấu, in hoa, gộp khoảng trắng. */
export function normalizeName(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "D").toUpperCase().replace(/\s+/g, " ").trim();
}
