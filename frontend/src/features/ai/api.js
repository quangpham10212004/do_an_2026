import { api } from "@/lib/api";

// ai-service (AI Interview: Thắng; CV Parsing + Chatbot enrichment: Quang)
export const aiApi = {
  // AI Interview
  myInterview: () => api("/api/ai/interviews/me"),
  startInterview: () => api("/api/ai/interviews", { method: "POST" }),
  answerInterview: (id, answer) => api(`/api/ai/interviews/${id}/answers`, { method: "POST", body: { answer } }),
  interview: (id) => api(`/api/ai/interviews/${id}`),
  adminInterviews: (status = "") => api(`/api/ai/admin/interviews?status=${status}`),
  reviewInterview: (id, decision, note) => api(`/api/ai/admin/interviews/${id}/review`, { method: "POST", body: { decision, note } }),
  adminStats: () => api("/api/ai/admin/stats"),
  // CV + chatbot enrichment
  uploadCv: (menteeId, file) => {
    const form = new FormData();
    form.append("file", file);
    return api(`/api/ai/mentee/${menteeId}/cv-upload`, { method: "POST", form });
  },
  parseCv: (file) => {
    const form = new FormData();
    form.append("file", file);
    return api("/api/ai/cv/parse", { method: "POST", form });
  },
  cvFileUrl: (cvId) => `/api/ai/cv/${cvId}/file`,
  latestEnrichment: (menteeId) => api(`/api/ai/mentee/${menteeId}/enrichment/latest`),
  answerEnrichment: (id, answer) => api(`/api/ai/enrichment/conversations/${id}/answers`, { method: "POST", body: { answer } }),
};
