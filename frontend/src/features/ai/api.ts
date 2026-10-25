import { api, apiBlob } from "@/lib/api";
import type { ConfirmedCvFields, Cv, Conversation, CvSummary, CvUploadResult, Interview, InterviewStats, InterviewVideo, Round1Decision, Round2Decision, Round2Room, Round2Scores, Uuid, VerificationApplication, VerificationState, Practice, PracticeEligibility, PracticeStart, StartPracticeInput, VoiceInterviewStart, VoiceTranscriptItem } from "@/types";

// ai-service (AI Interview: Thắng; CV Parsing + Chatbot enrichment: Quang)
export const aiApi = {
  // AI Interview — /interviews/me trả 204 (null) khi mentor chưa phỏng vấn lần nào
  myInterview: () => api<Interview | null>("/api/ai/interviews/me"),
  // Đợt xác thực: số lần còn lại, thời gian chờ 15 ngày, bước hiện tại. 409 INTERVIEW_COOLDOWN / INTERVIEW_PENDING_REVIEW / ALREADY_APPROVED
  verificationStatus: () => api<VerificationState>("/api/ai/verification/status"),
  startVerification: () => api<VerificationState>("/api/ai/verification/applications", { method: "POST" }),
  interview: (id: Uuid) => api<Interview>(`/api/ai/interviews/${id}`),
  adminApplications: (status = "") => api<VerificationApplication[]>(`/api/ai/admin/verification/applications?status=${status}`),
  adminApplication: (id: Uuid) => api<VerificationApplication>(`/api/ai/admin/verification/applications/${id}`),
  // PASS | REJECT | RETAKE; ghi chú ≥ 10 ký tự khi RETAKE hoặc quyết định ngược khuyến nghị AI (400 REVIEW_NOTE_REQUIRED)
  round1Review: (id: Uuid, decision: Round1Decision, note: string) =>
    api<VerificationApplication>(`/api/ai/admin/verification/applications/${id}/round1-review`, { method: "POST", body: { decision, note } }),
  // Vòng 2 (admin phỏng vấn qua Jitsi). Admin đề xuất khung giờ (ISO) → mentor chọn / đổi giờ (≤ 2 lần, báo trước ≥ 24 giờ)
  proposeSlots: (id: Uuid, startsAt: string[]) =>
    api<VerificationApplication>(`/api/ai/admin/verification/applications/${id}/slots`, { method: "POST", body: { startsAt } }),
  chooseSlot: (slotId: Uuid) => api<VerificationState>(`/api/ai/verification/slots/${slotId}/choose`, { method: "POST" }),
  rescheduleRound2: () => api<VerificationState>("/api/ai/verification/round2/reschedule", { method: "POST" }),
  // 409 ROOM_CLOSED (kèm opensAt) ngoài khung giờ phòng mở; lần đầu mỗi bên lấy token được ghi vào nhật ký vào phòng
  round2Room: (applicationId?: Uuid) =>
    api<Round2Room>(`/api/ai/verification/round2/room${applicationId ? `?applicationId=${applicationId}` : ""}`),
  mentorAbsent: (id: Uuid) => api<VerificationApplication>(`/api/ai/admin/verification/applications/${id}/mentor-absent`, { method: "POST" }),
  // APPROVE | REJECT cần đủ 5 điểm (tiêu chí ≤ 2 hoặc ≥ 9 kèm lý do ≥ 10 ký tự); RESCHEDULE không cần phiếu
  round2Decision: (id: Uuid, decision: Round2Decision, scores: Round2Scores | null, scoreNotes: Record<string, string>, note: string) =>
    api<VerificationApplication>(`/api/ai/admin/verification/applications/${id}/decision`, { method: "POST", body: { decision, scores, scoreNotes, note } }),
  adminStats: () => api<InterviewStats>("/api/ai/admin/stats"),
  // FR-7.7 — phỏng vấn giọng nói (cách duy nhất): gọi lại khi đang có buổi < 30 phút = kết nối lại (client secret mới).
  // 400 SELF_ANSWER_ACK_REQUIRED / VOICE_CONSENT_REQUIRED; 409 INTERVIEW_COOLDOWN / INTERVIEW_LOCKED; 503 VOICE_UNAVAILABLE (prod chưa bật); voice = null khi server chưa có OPENAI_API_KEY.
  // consentVideo bắt buộc (400 VIDEO_CONSENT_REQUIRED): camera quay video buổi phỏng vấn, lưu 60 ngày, admin xem được.
  startVoiceInterview: (selfAnswerAcknowledged: boolean, consentExternalAi: boolean, consentVideo: boolean) =>
    api<VoiceInterviewStart>("/api/ai/interviews/voice", { method: "POST", body: { selfAnswerAcknowledged, consentExternalAi, consentVideo } }),
  // Tải đoạn video (kind = chunks) hoặc âm thanh riêng (audio-chunks) theo chỉ số n; startMs / durMs tính từ lúc bắt đầu buổi.
  uploadVideoChunk: (id: Uuid, kind: "chunks" | "audio-chunks", n: number, blob: Blob, startMs: number, durMs: number) =>
    api<null>(`/api/ai/verification/videos/${id}/${kind}/${n}?startMs=${Math.round(startMs)}&durMs=${Math.round(durMs)}`,
      { method: "PUT", raw: blob, headers: { "Content-Type": blob.type || "application/octet-stream" } }),
  finishVideo: (id: Uuid) => api<InterviewVideo>(`/api/ai/verification/videos/${id}/finish`, { method: "POST" }),
  // Link phát video có token ngắn hạn (thẻ <video> không gửi được header Authorization); admin xem được ghi nhật ký.
  videoPlayUrl: (id: Uuid) => api<{ url: string; expiresAt: string }>(`/api/ai/verification/videos/${id}/play-token`, { method: "POST" }),
  deleteVideo: (id: Uuid) => api<InterviewVideo>(`/api/ai/admin/verification/videos/${id}`, { method: "DELETE" }),
  // Bản ghi → chấm theo chủ đề → PENDING_REVIEW. 400 EMPTY_TRANSCRIPT
  submitVoiceTranscript: (id: Uuid, items: VoiceTranscriptItem[]) =>
    api<Interview>(`/api/ai/interviews/${id}/voice-transcript`, { method: "POST", body: { items } }),
  // FR-10.x — mentee luyện phỏng vấn với AI (1 buổi miễn phí; 409 PRACTICE_FREE_USED)
  practiceEligibility: () => api<PracticeEligibility>("/api/ai/practice-interviews/eligibility"),
  startPractice: (input: StartPracticeInput) => api<PracticeStart>("/api/ai/practice-interviews", { method: "POST", body: input }),
  completePractice: (id: Uuid, items: VoiceTranscriptItem[]) =>
    api<Practice>(`/api/ai/practice-interviews/${id}/complete`, { method: "POST", body: { items } }),
  myPractices: () => api<Practice[]>("/api/ai/practice-interviews/me"),
  practice: (id: Uuid) => api<Practice>(`/api/ai/practice-interviews/${id}`),
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
  // US-45: removeSkills = gỡ cả kỹ năng đã thêm vào hồ sơ từ CV này
  deleteCv: (id: Uuid, removeSkills = false) =>
    api<null>(`/api/ai/cv/${id}${removeSkills ? "?removeSkills=true" : ""}`, { method: "DELETE" }),
  // 204 (null) khi mentee chưa tải CV lần nào
  latestEnrichment: (menteeId: Uuid) => api<CvUploadResult | null>(`/api/ai/mentee/${menteeId}/enrichment/latest`),
  answerEnrichment: (id: Uuid, answer: string, skipped = false) =>
    api<Conversation>(`/api/ai/enrichment/conversations/${id}/answers`, { method: "POST", body: { answer, skipped } }),
  // US-21: goal nháp chỉ vào hồ sơ khi người dùng xác nhận (gọi lại không đồng bộ lần hai); bỏ qua = không gửi gì
  // US-45: skills = kỹ năng gợi ý được chọn thêm vào hồ sơ (bỏ trống = tất cả)
  confirmGoal: (id: Uuid, goal: string, skills?: string[]) =>
    api<Conversation>(`/api/ai/enrichment/conversations/${id}/confirm-goal`, { method: "POST", body: { goal, skills } }),
  discardGoal: (id: Uuid) => api<Conversation>(`/api/ai/enrichment/conversations/${id}/discard-goal`, { method: "POST" }),
};
