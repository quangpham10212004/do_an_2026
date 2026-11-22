import { api } from "@/lib/api";
import type { ConfirmedCvFields, Conversation, Uuid } from "@/types";

export type CvInsight = CvCompleteness;

export interface CvCompleteness {
  percent: number;
  /** Những mục CV chưa nói tới (chatbot sẽ hỏi riêng). */
  missing: string[];
}

export interface CvPrivacy {
  /** Cho phép gửi CV tới AI bên ngoài để phân tích. */
  allowExternalAi: boolean;
}

export const onbxApi = {
  /** GET /api/ai/cv/{id}/completeness -> CvCompleteness. */
  completeness: (cvId: string): Promise<CvCompleteness> => api<CvCompleteness>(`/api/ai/cv/${cvId}/completeness`),
  /** GET /api/ai/cv/privacy -> CvPrivacy. */
  getPrivacy: (): Promise<CvPrivacy> => api<CvPrivacy>("/api/ai/cv/privacy"),
  /** PUT /api/ai/cv/privacy { allowExternalAi }. */
  setPrivacy: (p: CvPrivacy): Promise<CvPrivacy> => api<CvPrivacy>("/api/ai/cv/privacy", { method: "PUT", body: p }),
};

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type UploadErrorKind = "unreadable" | "too-large" | "ai-busy" | "other";

/** Phân loại lỗi tải CV từ mã HTTP / mã lỗi backend. */
export function classifyUploadError(status?: number, code?: string): UploadErrorKind {
  const c = (code ?? "").toUpperCase();
  if (status === 413 || c.includes("TOO_LARGE") || c.includes("FILE_SIZE")) return "too-large";
  if (status === 422 || c.includes("UNREADABLE") || c.includes("PASSWORD") || c.includes("EMPTY_TEXT") || c.includes("NO_TEXT")) return "unreadable";
  if (status === 502 || status === 503 || status === 504 || c.includes("AI_BUSY") || c.includes("AI_UNAVAILABLE")) return "ai-busy";
  return "other";
}

/** "Viết lại bản khác": POST /api/ai/enrichment/conversations/{id}/regenerate-goal → Conversation mới có enrichedGoal khác. */
export async function regenerateGoal(conversationId: Uuid): Promise<Conversation> {
  return api<Conversation>(`/api/ai/enrichment/conversations/${conversationId}/regenerate-goal`, { method: "POST" });
}
