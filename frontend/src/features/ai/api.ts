import { api, apiBlob } from "@/lib/api";
import type { ConfirmedCvFields, Cv, Conversation, CvSummary, CvUploadResult, Interview, InterviewEligibility, InterviewStats, InterviewStatus, ReviewDecision, Uuid } from "@/types";

// ai-service (AI Interview: Thắng; CV Parsing + Chatbot enrichment: Quang)
export const aiApi = {
  // AI Interview — /interviews/me trả 204 (null) khi mentor chưa phỏng vấn lần nào
  myInterview: () => api<Interview | null>("/api/ai/interviews/me"),
  // US-22: bắt buộc selfAnswerAcknowledged = true (400 SELF_ANSWER_ACK_REQUIRED); 409 INTERVIEW_COOLDOWN / INTERVIEW_LOCKED
  startInterview: (selfAnswerAcknowledged: boolean) =>
    api<Interview>("/api/ai/interviews", { method: "POST", body: { selfAnswerAcknowledged } }),
  interviewEligibility: () => api<InterviewEligibility>("/api/ai/interviews/eligibility"),
  adminInterviewEligibility: (mentorId: Uuid) => api<InterviewEligibility>(`/api/ai/admin/interviews/mentors/${mentorId}/eligibility`),
  unlockInterviews: (mentorId: Uuid, note: string) =>
    api<InterviewEligibility>(`/api/ai/admin/interviews/mentors/${mentorId}/unlock`, { method: "POST", body: { note } }),
  answerInterview: (id: Uuid, answer: string) => api<Interview>(`/api/ai/interviews/${id}/answers`, { method: "POST", body: { answer } }),
  interview: (id: Uuid) => api<Interview>(`/api/ai/interviews/${id}`),
  adminInterviews: (status: InterviewStatus | "" = "") => api<Interview[]>(`/api/ai/admin/interviews?status=${status}`),
  reviewInterview: (id: Uuid, decision: ReviewDecision, note: string) =>
    api<Interview>(`/api/ai/admin/interviews/${id}/review`, { method: "POST", body: { decision, note } }),
  adminStats: () => api<InterviewStats>("/api/ai/admin/stats"),
  // CV + chatbot enrichment
  // US-19: consentExternalAi bắt buộc — false => chỉ engine rule-based cho CV này (parse + chatbot)
  uploadCv: (menteeId: Uuid, file: File, consentExternalAi: boolean) => {
    const form = new FormData();
    form.append("file", file);
    form.append("consentExternalAi", String(consentExternalAi));
    return api<CvUploadResult>(`/api/ai/mentee/${menteeId}/cv-upload`, { method: "POST", form });
  },
  parseCv: (file: File, consentExternalAi: boolean) => {
    const form = new FormData();
    form.append("file", file);
    form.append("consentExternalAi", String(consentExternalAi));
    return api<Cv>("/api/ai/cv/parse", { method: "POST", form });
  },
  // US-20: lưu thông tin đã duyệt (chỉ chủ CV), rồi mới bắt đầu chatbot (409 CV_NOT_REVIEWED nếu chưa duyệt)
  confirmCvFields: (cvId: Uuid, fields: ConfirmedCvFields) =>
    api<Cv>(`/api/ai/cv/${cvId}/confirmed-fields`, { method: "PUT", body: fields }),
  startEnrichment: (cvId: Uuid) => api<CvUploadResult>(`/api/ai/cv/${cvId}/enrichment-conversation`, { method: "POST" }),
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
  // US-21: goal nháp chỉ vào hồ sơ khi người dùng xác nhận (gọi lại không đồng bộ lần hai); bỏ qua = không gửi gì
  confirmGoal: (id: Uuid, goal: string) =>
    api<Conversation>(`/api/ai/enrichment/conversations/${id}/confirm-goal`, { method: "POST", body: { goal } }),
  discardGoal: (id: Uuid) => api<Conversation>(`/api/ai/enrichment/conversations/${id}/discard-goal`, { method: "POST" }),
};
