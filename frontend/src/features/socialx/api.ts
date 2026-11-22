/**
 * Blog (lượt xem, chế độ hiển thị, ảnh bìa), tuỳ chọn thông báo và tin nhắn (hiện diện, đính kèm, tắt thông báo).
 * Mọi hàm gọi backend thật; localStorage chỉ giữ nháp bài viết và ghi nhớ các tin đã cảnh báo liên hệ trên trình duyệt này.
 */
import { api, apiBlob } from "@/lib/api";
import { mentoringApi } from "@/features/mentoring/api";
import type { MentoringSession } from "@/types";

/* ------------------------------------------------------------------ localStorage an toàn */

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch { /* bỏ qua */ }
}

/* ------------------------------------------------------------------ BLOG */

export type BlogVisibility = "PUBLIC" | "UNLISTED";

export interface LocalDraft {
  title: string;
  summary: string;
  contentMd: string;
  coverUrl: string;
  tags: string;
  visibility: BlogVisibility;
  savedAt: string;
}

const draftKey = (postId?: string) => `socialx:draft:${postId ?? "new"}`;

export const blogX = {
  /** GET /api/learning/blog/posts/views?ids=a,b,c  ->  { [postId]: number } */
  async views(posts: { id: string }[]): Promise<Record<string, number>> {
    if (!posts.length) return {};
    return api<Record<string, number>>(`/api/learning/blog/posts/views?ids=${posts.map((p) => p.id).join(",")}`);
  },

  /** POST /api/learning/blog/posts/{id}/view -> 204 (không tính tác giả). */
  async recordView(postId: string): Promise<void> {
    await api<void>(`/api/learning/blog/posts/${postId}/view`, { method: "POST" });
  },

  /** GET /api/learning/blog/posts/{id}/visibility. Chế độ hiển thị được lưu cùng bài (trường `visibility` khi tạo/sửa). */
  async getVisibility(postId: string): Promise<BlogVisibility> {
    return (await api<{ visibility: BlogVisibility }>(`/api/learning/blog/posts/${postId}/visibility`)).visibility;
  },

  /** POST /api/learning/blog/uploads/cover (multipart, field "file") -> { url } */
  async uploadCover(file: File): Promise<{ url: string }> {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error("Chỉ nhận ảnh PNG, JPG, WebP hoặc GIF.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Ảnh bìa tối đa 5 MB.");
    const form = new FormData();
    form.append("file", file);
    return api<{ url: string }>("/api/learning/blog/uploads/cover", { method: "POST", form });
  },

  /** Nháp tự lưu theo giờ — chỉ ở trình duyệt, không cần API. */
  loadDraft(postId?: string): LocalDraft | null {
    return readJson<LocalDraft | null>(draftKey(postId), null);
  },
  saveDraft(postId: string | undefined, d: Omit<LocalDraft, "savedAt">): string | null {
    const savedAt = new Date().toISOString();
    // Ảnh bìa dạng data URL quá lớn thì bỏ khỏi nháp để không đầy bộ nhớ.
    const coverUrl = d.coverUrl.startsWith("data:") && d.coverUrl.length > 400_000 ? "" : d.coverUrl;
    return writeJson(draftKey(postId), { ...d, coverUrl, savedAt }) ? savedAt : null;
  },
  clearDraft(postId?: string) {
    removeKey(draftKey(postId));
  },
};

/* ------------------------------------------------------------------ THÔNG BÁO */

export type NotifCategory = "session" | "request" | "payment" | "blog" | "message";

export interface NotificationPrefs {
  channels: Record<NotifCategory, { inApp: boolean; email: boolean }>;
  /** Nhắc lịch trước phiên (phút). */
  reminders: { d1: boolean; h1: boolean; m30: boolean };
}

export const NOTIF_CATEGORIES: { id: NotifCategory; label: string }[] = [
  { id: "session", label: "Phiên học và nhắc lịch" },
  { id: "request", label: "Yêu cầu mentoring" },
  { id: "payment", label: "Thanh toán và ví" },
  { id: "blog", label: "Blog (thích, bình luận, theo dõi)" },
  { id: "message", label: "Tin nhắn mới" },
];

export const DEFAULT_PREFS: NotificationPrefs = {
  channels: {
    session: { inApp: true, email: true },
    request: { inApp: true, email: true },
    payment: { inApp: true, email: true },
    blog: { inApp: true, email: false },
    message: { inApp: true, email: false },
  },
  reminders: { d1: true, h1: true, m30: true },
};

export const notificationX = {
  /**
   * GET/PUT /api/notifications/preferences. Thông báo bảo mật, tài khoản và xác thực luôn gửi; backend bỏ qua cờ tắt của chúng.
   */
  getPrefs: (): Promise<NotificationPrefs> => api<NotificationPrefs>("/api/notifications/preferences"),
  savePrefs: (prefs: NotificationPrefs): Promise<NotificationPrefs> =>
    api<NotificationPrefs>("/api/notifications/preferences", { method: "PUT", body: prefs }),
};

/* ------------------------------------------------------------------ TIN NHẮN */

export interface Presence { online: boolean; lastSeenAt: string | null }

export interface SharedFile {
  id: string;
  conversationId: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  /** URL tải về (cần access token, tải qua apiBlob). */
  url: string | null;
  mine: boolean;
}

export interface UpcomingSession { id: string; title: string; startsAt: string; href: string }

const MAX_FILE = 10 * 1024 * 1024;
const BLOCKED_EXT = /\.(exe|bat|cmd|msi|scr|js|vbs|sh|apk|dmg)$/i;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Phát hiện thông tin liên hệ ngoài nền tảng trong nội dung tin nhắn (cảnh báo trước khi gửi). */
export function detectContact(text: string): "phone" | "email" | null {
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) return "email";
  if (/(?:\+?84|0)[\s.-]?\d(?:[\s.-]?\d){8,9}/.test(text)) return "phone";
  return null;
}

export const CONTACT_WARNING: Record<"phone" | "email", string> = {
  phone: "Tin nhắn có vẻ chứa số điện thoại. Vui lòng không trao đổi liên hệ ngoài MentorHub để được bảo vệ khi thanh toán và khiếu nại. Nếu gửi, tin nhắn sẽ được ghi nhận.",
  email: "Tin nhắn có vẻ chứa địa chỉ email. Vui lòng không trao đổi liên hệ ngoài MentorHub để được bảo vệ khi thanh toán và khiếu nại. Nếu gửi, tin nhắn sẽ được ghi nhận.",
};

export const messageX = {
  /** GET /api/mentoring/conversations/{id}/presence/{userId} -> { online, lastSeenAt } */
  presence: (conversationId: string, userId: string): Promise<Presence> =>
    api<Presence>(`/api/mentoring/conversations/${conversationId}/presence/${userId}`),

  /** Phiên sắp tới giữa hai người của hội thoại (id hội thoại = id yêu cầu mentoring), dựng từ mentoringApi.sessions(). */
  async upcomingSession(conversationId: string): Promise<UpcomingSession | null> {
    const list: MentoringSession[] = await mentoringApi.sessions().catch(() => []);
    const now = Date.now();
    const next = list
      .filter((s) => s.requestId === conversationId && ["CONFIRMED", "AWAITING_MENTOR", "PENDING"].includes(s.status) && new Date(s.scheduledAt).getTime() > now)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
    return next ? { id: next.id, title: next.topic || "Phiên mentoring", startsAt: next.scheduledAt, href: `/mentoring/sessions/${next.id}` } : null;
  },

  /** POST /api/mentoring/conversations/{id}/attachments (multipart, field "file") -> SharedFile */
  async uploadAttachment(conversationId: string, file: File): Promise<SharedFile> {
    if (file.size > MAX_FILE) throw new Error("Tệp tối đa 10 MB.");
    if (BLOCKED_EXT.test(file.name)) throw new Error("Không gửi tệp thực thi hoặc mã chạy được.");
    const form = new FormData();
    form.append("file", file);
    return api<SharedFile>(`/api/mentoring/conversations/${conversationId}/attachments`, { method: "POST", form });
  },
  /** GET /api/mentoring/conversations/{id}/attachments -> SharedFile[] */
  sharedFiles: (conversationId: string): Promise<SharedFile[]> => api<SharedFile[]>(`/api/mentoring/conversations/${conversationId}/attachments`),
  async downloadAttachment(file: SharedFile): Promise<void> {
    if (!file.url) return;
    const url = URL.createObjectURL(await apiBlob(file.url));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** GET/PUT /api/mentoring/conversations/{id}/mute -> { muted } */
  async getMuted(conversationId: string): Promise<boolean> {
    return (await api<{ muted: boolean }>(`/api/mentoring/conversations/${conversationId}/mute`)).muted;
  },
  async setMuted(conversationId: string, muted: boolean): Promise<void> {
    await api<void>(`/api/mentoring/conversations/${conversationId}/mute`, { method: "PUT", body: { muted } });
  },

  /** Ghi nhớ trên trình duyệt này các tin gửi đi đã bị cảnh báo có SĐT/email (chỉ để hiện huy hiệu). */
  flaggedMessages(conversationId: string): Record<string, "phone" | "email"> {
    return readJson<Record<string, "phone" | "email">>(`socialx:flags:${conversationId}`, {});
  },
  flagMessage(conversationId: string, messageId: string, kind: "phone" | "email") {
    const all = this.flaggedMessages(conversationId);
    all[messageId] = kind;
    writeJson(`socialx:flags:${conversationId}`, all);
  },
};
