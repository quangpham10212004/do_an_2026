/**
 * Lớp API kiểm duyệt mở rộng (tranh chấp, báo cáo tin nhắn, vi phạm liên hệ, blog, nhật ký).
 * Mọi dữ liệu và thao tác đều đi qua backend (mentoring-service, learning-service, auth-service).
 */
import { adminxApi } from "@/features/adminx/api";
import { authApi } from "@/features/auth/api";
import { blogApi } from "@/features/learning/blogApi";
import { mentoringApi } from "@/features/mentoring/api";
import { blogX } from "@/features/socialx/api";
import { api } from "@/lib/api";
import type {
  AuditEntry, BlogReport, ContactKind, ContactViolationSummary, Dispute, MessageReport,
  MessageReportOutcome, MessageReportReason, ResolveDisputeInput, Uuid,
} from "@/types";

const HOUR = 3600_000;

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const code4 = (id: string) => String(hash(id) % 10000).padStart(4, "0");
/** Mã hiển thị #D-xxxx / #R-xxxx suy ra ổn định từ id. */
export const disputeCode = (id: string) => `#D-${code4(id)}`;
export const reportCode = (id: string) => `#R-${code4(id)}`;

// =====================================================================================
// TRANH CHẤP
// =====================================================================================

export interface Statement { text: string | null; evidence: { label: string; href?: string }[] }
export interface TimelineEvent { at: string; who: "Mentee" | "Mentor" | "Hệ thống"; text: string; flag?: boolean }
export interface DisputeExtra {
  /** Mã hiển thị #D-xxxx. */
  code: string;
  /** Lời kể của từng bên. */
  mentee: Statement;
  mentor: Statement;
  /** Nhật ký hệ thống (khách quan). */
  timeline: TimelineEvent[];
  /** Nhận định tự động từ nhật ký. */
  timelineNote: string | null;
  /** Tiền đang giữ (VND), 0 khi đã giải quyết. */
  held: number;
  /** Admin đã yêu cầu thêm bằng chứng từ bên nào. */
  evidenceRequestedFrom: ("MENTEE" | "MENTOR")[];
  /** Hai bên có lời kể mâu thuẫn không. */
  mismatch: boolean;
}


const ATT: Record<string, string> = { ATTENDED: "có mặt", NO_SHOW: "vắng mặt", PRESENT: "có mặt", ABSENT: "vắng mặt" };

/** Danh sách tranh chấp (tất cả trạng thái): GET /api/mentoring/admin/disputes. */
export async function listDisputes(): Promise<{ items: Dispute[]; error?: string }> {
  try {
    const items = (await mentoringApi.adminDisputes("")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Không tải được danh sách tranh chấp." };
  }
}

/** GET /api/mentoring/admin/disputes/{id}. */
export const getDispute = (id: Uuid): Promise<Dispute> => mentoringApi.adminDispute(id);

/**
 * Dữ liệu mở rộng của tranh chấp: dựng từ dữ liệu thật (lời bên mở, điểm danh, mốc phiên) cộng với
 * GET /api/mentoring/admin/disputes/{id}/context (các bên đã bị yêu cầu thêm bằng chứng).
 */
export async function getDisputeExtra(d: Dispute): Promise<DisputeExtra> {
  const held = d.status === "RESOLVED" ? 0 : Number(d.session?.price || 0);
  const asked = await api<{ evidenceRequestedFrom: ("MENTEE" | "MENTOR")[] }>(`/api/mentoring/admin/disputes/${d.id}/context`)
    .then((r) => r.evidenceRequestedFrom).catch(() => [] as ("MENTEE" | "MENTOR")[]);
  const s = d.session;
  const evidence = d.evidenceLinks.map((l, i) => ({ label: `Bằng chứng ${i + 1}`, href: l }));
  const mine: Statement = { text: d.description, evidence };
  const empty: Statement = { text: null, evidence: [] };
  const timeline: TimelineEvent[] = [];
  if (s) {
    timeline.push({ at: s.scheduledAt, who: "Hệ thống", text: "phiên bắt đầu theo lịch" });
    if (s.menteeAttendance) timeline.push({ at: s.endsAt, who: "Mentee", text: `xác nhận ${ATT[s.menteeAttendance] ?? s.menteeAttendance}`, flag: /NO_SHOW|ABSENT/.test(s.menteeAttendance) });
    if (s.mentorAttendance) timeline.push({ at: s.endsAt, who: "Mentor", text: `xác nhận ${ATT[s.mentorAttendance] ?? s.mentorAttendance}`, flag: /NO_SHOW|ABSENT/.test(s.mentorAttendance) });
  }
  timeline.push({ at: d.createdAt, who: d.openedByRole === "MENTOR" ? "Mentor" : d.openedByRole === "MENTEE" ? "Mentee" : "Hệ thống", text: "mở tranh chấp" });
  const mismatch = !!s && !!s.menteeAttendance && !!s.mentorAttendance && s.menteeAttendance !== s.mentorAttendance;
  return {
    code: disputeCode(d.id),
    mentee: d.openedByRole === "MENTEE" ? mine : empty,
    mentor: d.openedByRole === "MENTOR" ? mine : empty,
    timeline, timelineNote: null, held, evidenceRequestedFrom: asked, mismatch,
  };
}

/** POST /api/mentoring/admin/disputes/{id}/start-review. */
export const startDisputeReview = (d: Dispute): Promise<Dispute> => mentoringApi.startDisputeReview(d.id);

export interface ResolveInput extends ResolveDisputeInput {
  /** Ghi nhận vào độ tin cậy của bên có lỗi (backend hiện chưa nhận cờ này nên chưa được gửi). */
  recordReliability: boolean;
}

/** POST /api/mentoring/admin/disputes/{id}/resolve. */
export function resolveDispute(d: Dispute, { recordReliability, ...body }: ResolveInput): Promise<Dispute> {
  void recordReliability;
  return mentoringApi.resolveDispute(d.id, body);
}

/** Yêu cầu thêm bằng chứng từ một bên: POST /api/mentoring/admin/disputes/{id}/request-evidence. */
export async function requestDisputeEvidence(d: Dispute, from: "MENTEE" | "MENTOR" | "BOTH", message: string): Promise<void> {
  await api<void>(`/api/mentoring/admin/disputes/${d.id}/request-evidence`, { method: "POST", body: { from, message } });
}

// =====================================================================================
// BÁO CÁO TIN NHẮN
// =====================================================================================

export type ModAction = MessageReportOutcome | "RESTRICTED_7D" | "SUSPENDED";

export const MOD_ACTION_LABELS: Record<ModAction, string> = {
  DISMISSED: "Đã bỏ qua", WARNED: "Đã cảnh cáo người bị báo", RESTRICTED_7D: "Hạn chế nhắn tin 7 ngày", SUSPENDED: "Đã đình chỉ tài khoản",
};

export interface ReportRow extends MessageReport {
  code: string;
  /** Vai trò người bị báo / người báo (nếu biết). */
  senderRole: "MENTEE" | "MENTOR" | null;
  reporterRole: "MENTEE" | "MENTOR" | null;
  /** Số báo cáo trước đó với cùng người bị báo. */
  priorReports: number;
  /** Chế tài mở rộng đã áp (đình chỉ tài khoản người bị báo qua auth-service). */
  sanction: "RESTRICTED_7D" | "SUSPENDED" | null;
}

/** Chế tài được ghi kèm ghi chú xử lý để còn hiện lại sau khi tải lại trang. */
const SANCTION_TAG = /^\[\[SANCTION:(RESTRICTED_7D|SUSPENDED)\]\]\s*/;

function enrichReports(items: MessageReport[]): ReportRow[] {
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return items.map((r) => {
    const prior = r.senderName ? sorted.filter((x) => x.senderName === r.senderName && x.createdAt < r.createdAt).length : 0;
    const tag = SANCTION_TAG.exec(r.resolutionNote ?? "");
    return {
      ...r,
      resolutionNote: r.resolutionNote ? r.resolutionNote.replace(SANCTION_TAG, "") || null : null,
      code: reportCode(r.id),
      senderRole: r.reportedMessage?.senderRole ?? null,
      reporterRole: r.reportedMessage ? (r.reportedMessage.senderRole === "MENTOR" ? "MENTEE" : "MENTOR") : null,
      priorReports: prior,
      sanction: (tag?.[1] as ReportRow["sanction"]) ?? null,
    };
  });
}

/** Tất cả báo cáo tin nhắn: GET /api/mentoring/admin/message-reports. */
export async function listMessageReports(): Promise<{ items: ReportRow[]; error?: string }> {
  try {
    const items = enrichReports(await mentoringApi.adminMessageReports("")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Không tải được báo cáo." };
  }
}

/** Chi tiết (có thread khi OPEN): GET /api/mentoring/admin/message-reports/{id}. */
export async function getMessageReport(id: Uuid): Promise<ReportRow> {
  return enrichReports([await mentoringApi.adminMessageReport(id)])[0];
}

/**
 * Xử lý báo cáo: POST /api/mentoring/admin/message-reports/{id}/resolve.
 * RESTRICTED_7D / SUSPENDED: đóng báo cáo bằng WARNED (kèm thẻ chế tài trong ghi chú) và đình chỉ tài khoản
 * người bị báo qua auth-service (7 ngày / vĩnh viễn).
 */
export async function resolveMessageReport(r: ReportRow, action: ModAction, note?: string): Promise<void> {
  const outcome: MessageReportOutcome = action === "DISMISSED" ? "DISMISSED" : "WARNED";
  const sanction = action === "RESTRICTED_7D" || action === "SUSPENDED" ? action : null;
  if (sanction) {
    const target = r.reportedMessage?.senderId;
    if (!target) throw new Error("Không xác định được người bị báo để áp chế tài.");
    await adminxApi.suspendUser(target, sanction === "SUSPENDED" ? "permanent" : "7d", note?.trim() || "Vi phạm quy tắc nhắn tin");
  }
  await mentoringApi.resolveMessageReport(r.id, outcome, sanction ? `[[SANCTION:${sanction}]] ${note ?? ""}`.trim() : note);
}

export const REPORT_REASON_TONE: Record<MessageReportReason, "danger" | "warning" | "neutral"> = {
  HARASSMENT: "danger", OFF_PLATFORM_PAYMENT: "warning", SPAM: "warning", OTHER: "neutral",
};

// =====================================================================================
// VI PHẠM LIÊN HỆ
// =====================================================================================

export interface ViolationRow {
  userId: Uuid;
  userName: string | null;
  role: "MENTEE" | "MENTOR" | null;
  /** Nội dung phát hiện, đã che. */
  detected: string;
  /** Lần vi phạm trong kỳ. */
  count: number;
  lastAt: string;
  flagged: boolean;
}

const MASK_SAMPLE: Record<ContactKind, string> = {
  PHONE: "Số điện thoại: 0912 *** 678",
  EMAIL: "Email: n***@gmail.com",
  LINK: "Đường dẫn ngoài: https://***",
  SOCIAL: "Mạng xã hội: zalo.me/***",
};

/** Vi phạm liên hệ trong N ngày (gộp theo người): GET /api/mentoring/admin/contact-violations?days=. */
export async function listContactViolations(days: number): Promise<{ items: ViolationRow[]; error?: string }> {
  try {
    const real: ContactViolationSummary[] = await mentoringApi.adminContactViolations(days);
    const rows: ViolationRow[] = real.map((v) => ({
      userId: v.userId, userName: v.userName, role: null, count: v.count, lastAt: v.lastAt, flagged: v.flagged,
      detected: v.kinds.map((k) => MASK_SAMPLE[k] ?? k).join("; "),
    }));
    rows.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    return { items: rows };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Không tải được dữ liệu." };
  }
}

// =====================================================================================
// BLOG
// =====================================================================================

export type BlogRowStatus = "PUBLISHED" | "REMOVED";
export interface BlogRow {
  id: Uuid;
  slug: string;
  title: string;
  authorName: string;
  authorId: Uuid;
  publishedAt: string | null;
  views: number;
  status: BlogRowStatus;
  removedAt: string | null;
  removeReason: string | null;
  /** Báo cáo đang chờ (bài + bình luận thuộc bài). */
  reports: BlogReport[];
}

export interface BlogOverview { rows: BlogRow[]; published: number; pendingReports: number; removedThisMonth: number; activeAuthors: number; error?: string }

/**
 * Bài đã đăng + báo cáo đang chờ + bài đã gỡ.
 * GET /api/learning/blog/posts, GET /api/learning/blog/posts/views, GET /api/learning/admin/blog/reports?status=OPEN,
 * GET /api/learning/admin/blog/removed.
 */
export async function loadBlogOverview(): Promise<BlogOverview> {
  let error: string | undefined;
  const fail = (what: string) => (e: unknown) => { error = e instanceof Error ? e.message : what; return null; };
  const [page, reports, removedPosts] = await Promise.all([
    blogApi.posts({ size: 100 }).catch(fail("Không tải được bài viết.")),
    blogApi.admin.reports("OPEN").catch((e: unknown) => { error = e instanceof Error ? e.message : "Không tải được báo cáo."; return [] as BlogReport[]; }),
    blogApi.admin.removed().catch(fail("Không tải được bài đã gỡ.")),
  ]);
  const posts = page?.items ?? [];
  const views = await blogX.views(posts).catch(() => ({} as Record<string, number>));
  const rows: BlogRow[] = posts.map((p) => ({
    id: p.id, slug: p.slug, title: p.title, authorName: p.authorName, authorId: p.authorId, publishedAt: p.publishedAt, views: views[p.id] ?? 0,
    status: "PUBLISHED", removedAt: null, removeReason: null, reports: reports.filter((r) => r.postId === p.id),
  }));
  // Báo cáo trỏ tới bài không nằm trong trang đã tải: vẫn hiện để xử lý.
  for (const r of reports) {
    if (!rows.some((x) => x.id === r.postId)) {
      rows.push({ id: r.postId, slug: "", title: r.postTitle, authorName: "—", authorId: "", publishedAt: null, views: 0, status: "PUBLISHED", removedAt: null, removeReason: null, reports: reports.filter((x) => x.postId === r.postId) });
    }
  }
  const removed: BlogRow[] = (removedPosts ?? []).map((p) => ({
    id: p.id, slug: p.slug, title: p.title, authorName: p.authorName, authorId: p.authorId, publishedAt: p.publishedAt, views: p.views,
    status: "REMOVED", removedAt: p.unpublishedAt, removeReason: p.unpublishReason, reports: [],
  }));
  const all = [...rows, ...removed];
  const live = all.filter((r) => r.status === "PUBLISHED");
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  return {
    rows: all,
    published: page?.total ?? live.length,
    pendingReports: live.filter((r) => r.reports.length).length,
    removedThisMonth: all.filter((r) => r.removedAt && new Date(r.removedAt) >= monthStart).length,
    activeAuthors: new Set(live.map((r) => r.authorId).filter(Boolean)).size,
    error,
  };
}

/** Gỡ bài: POST /api/learning/admin/blog/posts/{id}/unpublish { reason } (backend tự đóng các báo cáo của bài). */
export async function takedownPost(row: BlogRow, reason: string): Promise<void> {
  await blogApi.admin.unpublish(row.id, reason);
  await Promise.all(row.reports.map((r) => blogApi.admin.resolve(r.id).catch(() => null)));
}

// =====================================================================================
// NHẬT KÝ
// =====================================================================================

export interface AdminOption { id: Uuid; name: string }

/** Danh sách quản trị viên cho bộ lọc: GET /api/auth/admin/users?role=ADMIN. */
export async function listAdmins(): Promise<AdminOption[]> {
  try {
    const page = await authApi.adminListUsers({ role: "ADMIN", page: 0 });
    return page.items.map((u) => ({ id: u.id, name: u.fullName || u.email }));
  } catch {
    return [];
  }
}

type Tone = "success" | "warning" | "danger" | "neutral";
/** Nhãn + màu của mã thao tác. Mã lạ hiện nguyên mã. */
export const AUDIT_ACTIONS: Record<string, { label: string; tone: Tone }> = {
  MENTOR_APPROVED: { label: "Duyệt mentor", tone: "success" },
  MENTOR_REJECTED: { label: "Từ chối mentor", tone: "danger" },
  MENTOR_SUSPENDED: { label: "Đình chỉ mentor", tone: "danger" },
  USER_LOCKED: { label: "Khoá tài khoản", tone: "danger" },
  USER_UNLOCKED: { label: "Mở khoá tài khoản", tone: "success" },
  ACCOUNT_LOCKED: { label: "Đình chỉ tài khoản", tone: "danger" },
  ACCOUNT_UNLOCKED: { label: "Mở khoá tài khoản", tone: "success" },
  DISPUTE_RESOLVED: { label: "Xử lý tranh chấp", tone: "warning" },
  PAYOUT_PAID: { label: "Chuyển khoản rút tiền", tone: "success" },
  PAYOUT_REJECTED: { label: "Từ chối rút tiền", tone: "danger" },
  BLOG_UNPUBLISHED: { label: "Gỡ bài blog", tone: "danger" },
  MESSAGE_REPORT_RESOLVED: { label: "Xử lý báo cáo tin nhắn", tone: "warning" },
};
export const auditActionLabel = (a: string) => AUDIT_ACTIONS[a]?.label ?? a;
export const auditActionTone = (a: string): Tone => AUDIT_ACTIONS[a]?.tone ?? "neutral";

const KEY_LABELS: Record<string, string> = {
  status: "trạng thái", reason: "lý do", note: "ghi chú", amount: "số tiền", outcome: "kết luận", refundPercent: "tỉ lệ hoàn", role: "vai trò", title: "tiêu đề",
};
const fmtVal = (v: unknown) => (v === null || v === undefined ? "trống" : typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v));

/**
 * Câu mô tả cho cột "Chi tiết". Dựng từ before/after của dòng nhật ký.
 * Diff đầy đủ vẫn nằm trong phần mở rộng.
 */
export function describeAudit(a: AuditEntry): string {
  const before = a.before ?? {};
  const after = a.after ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const text = (k: string) => KEY_LABELS[k] ?? k;
  const reasonKey = ["reason", "note"].find((k) => typeof after[k] === "string" && after[k]);
  const changed = keys.filter((k) => !["reason", "note"].includes(k) && fmtVal(before[k]) !== fmtVal(after[k]));
  const parts = changed.slice(0, 3).map((k) => (k in before && k in after
    ? `Đổi ${text(k)} từ "${fmtVal(before[k])}" sang "${fmtVal(after[k])}"`
    : k in after ? `Đặt ${text(k)} = "${fmtVal(after[k])}"` : `Bỏ ${text(k)} "${fmtVal(before[k])}"`));
  if (changed.length > 3) parts.push(`và ${changed.length - 3} trường khác`);
  let s = parts.join(". ");
  if (reasonKey) s += `${s ? ". " : ""}Lý do: ${after[reasonKey]}`;
  return s ? (s.endsWith(".") ? s : s + ".") : "Không có thay đổi chi tiết.";
}
