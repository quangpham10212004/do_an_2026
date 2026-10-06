import { api, apiBlob } from "@/lib/api";
import type { Cv, Conversation, CvSummary, CvUploadResult, Interview, InterviewStats, InterviewStatus, ReviewDecision, Uuid } from "@/types";

// ai-service (AI Interview: Thắng; CV Parsing + Chatbot enrichment: Quang)
export const aiApi = {
  // AI Interview — /interviews/me trả 204 (null) khi mentor chưa phỏng vấn lần nào
  myInterview: () => api<Interview | null>("/api/ai/interviews/me"),
  startInterview: () => api<Interview>("/api/ai/interviews", { method: "POST" }),
  answerInterview: (id: Uuid, answer: string) => api<Interview>(`/api/ai/interviews/${id}/answers`, { method: "POST", body: { answer } }),
  interview: (id: Uuid) => api<Interview>(`/api/ai/interviews/${id}`),
  adminInterviews: (status: InterviewStatus | "" = "") => api<Interview[]>(`/api/ai/admin/interviews?status=${status}`),
  reviewInterview: (id: Uuid, decision: ReviewDecision, note: string) =>
    api<Interview>(`/api/ai/admin/interviews/${id}/review`, { method: "POST", body: { decision, note } }),
  adminStats: () => api<InterviewStats>("/api/ai/admin/stats"),
  // CV + chatbot enrichment
  uploadCv: (menteeId: Uuid, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<CvUploadResult>(`/api/ai/mentee/${menteeId}/cv-upload`, { method: "POST", form });
  },
  parseCv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<Cv>("/api/ai/cv/parse", { method: "POST", form });
  },
  cvFileUrl: (cvId: Uuid) => `/api/ai/cv/${cvId}/file`,
  /** File PDF gốc (cần đăng nhập) — `url` là cvFileUrl / CvSummary.fileUrl. */
  cvFile: (url: string) => apiBlob(url),
  myCvs: () => api<CvSummary[]>("/api/ai/cv/mine"),
  // 204 → null; 403 FORBIDDEN (không phải chủ CV/admin), 404 CV_NOT_FOUND
  deleteCv: (id: Uuid) => api<null>(`/api/ai/cv/${id}`, { method: "DELETE" }),
  // 204 (null) khi mentee chưa tải CV lần nào
  latestEnrichment: (menteeId: Uuid) => api<CvUploadResult | null>(`/api/ai/mentee/${menteeId}/enrichment/latest`),
  answerEnrichment: (id: Uuid, answer: string) =>
    api<Conversation>(`/api/ai/enrichment/conversations/${id}/answers`, { method: "POST", body: { answer } }),
};
