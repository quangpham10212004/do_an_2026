import { api } from "@/lib/api";
import { auditActionLabel, auditActionTone } from "@/features/modx/api";
import { verifyAdminApi } from "@/features/verification/api";
import type { AuditEntry, PageResponse } from "@/types";

export type DashPeriod = "30d" | "60d" | "90d";
export const PERIOD_LABELS: Record<DashPeriod, string> = { "30d": "30 ngày gần nhất", "60d": "60 ngày gần nhất", "90d": "90 ngày gần nhất" };
export const PERIODS = Object.keys(PERIOD_LABELS) as DashPeriod[];

export interface GmvPoint { label: string; amount: number }

export interface DashKpis {
  newUsers: { total: number; mentees: number; mentors: number; deltaPercent: number | null };
  activeMentors: { accepting: number; verified: number };
  completedSessions: { total: number; deltaPercent: number | null };
  platformRevenue: { amount: number; gmv: number; feePercent: number };
  refundRate: { percent: number; /** điểm phần trăm so với kỳ trước; âm = giảm. */ deltaPoints: number };
}

export interface TopMentor { id: string; name: string; sessions: number; rating: number; gmv: number }

export type ActivityTone = "success" | "warning" | "danger";
export interface ActivityItem { id: string; tone: ActivityTone; /** Chuỗi có thể chứa **đậm** để nhấn mạnh. */ text: string; at: string }

export type ServiceState = "OK" | "SLOW" | "DOWN";
export interface ServiceStatus { id: string; name: string; state: ServiceState }
export const SERVICE_LABELS: Record<ServiceState, string> = { OK: "Ổn định", SLOW: "Chậm", DOWN: "Gián đoạn" };

export interface QueueExtras {
  verificationPending: number;
  /** Hồ sơ mentor chờ duyệt đã quá hạn SLA. */
  verificationOverdue: number;
  /** Hồ sơ mentor có cờ cần lưu ý (ví dụ AI nghi ngờ). */
  verificationFlagged: number;
}

export interface DashExtras {
  kpis: DashKpis;
  gmv: GmvPoint[];
  topMentors: TopMentor[];

}


type Registrations = Omit<DashKpis["newUsers"], "deltaPercent"> & { previous: number };
type Completed = { total: number; previous: number };
type RevenueReport = Pick<DashKpis, "platformRevenue" | "refundRate"> & {
  gmv: GmvPoint[];
  topMentors: Omit<TopMentor, "name" | "rating">[];
};

function deltaPercent(total: number, previous: number): number | null {
  return previous > 0 ? (total - previous) * 100 / previous : null;
}

export const adminDashApi = {
  async summary(period: DashPeriod): Promise<DashExtras> {
    const query = new URLSearchParams({ days: period.slice(0, -1), asOf: new Date().toISOString() });
    const [users, activeMentors, sessions, revenue] = await Promise.all([
      api<Registrations>("/api/auth/admin/dashboard/registrations?" + query),
      api<DashKpis["activeMentors"]>("/api/profile/admin/reporting/mentor-counts"),
      api<Completed>("/api/mentoring/admin/reporting/completed-sessions?" + query),
      api<RevenueReport>("/api/payment/admin/reporting/revenue?" + query),
    ]);
    const ids = new URLSearchParams({ ids: revenue.topMentors.map((mentor) => mentor.id).join(",") });
    const names = revenue.topMentors.length
      ? await api<Record<string, Pick<TopMentor, "name" | "rating">>>("/api/profile/admin/reporting/mentor-names?" + ids)
      : {};

    return {
      kpis: {
        newUsers: { total: users.total, mentees: users.mentees, mentors: users.mentors, deltaPercent: deltaPercent(users.total, users.previous) },
        activeMentors,
        completedSessions: { total: sessions.total, deltaPercent: deltaPercent(sessions.total, sessions.previous) },
        platformRevenue: revenue.platformRevenue,
        refundRate: revenue.refundRate,
      },
      gmv: revenue.gmv,
      topMentors: revenue.topMentors.map((mentor) => ({
        ...mentor,
        name: names[mentor.id]?.name ?? mentor.id,
        rating: names[mentor.id]?.rating ?? 0,
      })),
    };
  },

  async verificationQueue(): Promise<QueueExtras> {
    const verification = await verifyAdminApi.queue("UNCLEAR", "");
    return {
      verificationPending: verification.stats.unclear,
      verificationOverdue: verification.items.filter((item) => item.overdue).length,
      verificationFlagged: verification.items.filter((item) => item.confidence === "LOW").length,
    };
  },

  async recentActivity(): Promise<ActivityItem[]> {
    const { items } = await api<PageResponse<AuditEntry>>("/api/auth/admin/audit?page=0&size=4");
    return items.map((item) => {
      const tone = auditActionTone(item.action);
      const actor = item.actorEmail ?? (item.actorRole === "SYSTEM" ? "Hệ thống" : item.actorRole);
      return {
        id: item.id,
        tone: tone === "neutral" ? "success" : tone,
        text: "**" + actor + "** · " + auditActionLabel(item.action),
        at: item.createdAt,
      };
    });
  },

  services: () => api<ServiceStatus[]>("/api/auth/admin/dashboard/health"),
};

