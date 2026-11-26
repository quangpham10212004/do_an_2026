"use client";

import { api } from "@/lib/api";
import type {
  VerifyAdminDetail, VerifyAnswerInput, VerifyDecisionInput, VerifyHistoryItem, VerifyInterview, VerifyOverview,
  VerifyQueue, VerifyQueueFilter, VerifyResult, VerifyTrack,
} from "@/types/verification";

export interface VerifyMentorApi {
  /** GET /api/ai/verification/status → VerifyOverview (lượt xác thực theo lĩnh vực + quy định phỏng vấn). */
  overview(): Promise<VerifyOverview>;
  /** POST /api/ai/verification/tracks  body { domain } → VerifyTrack. Mỗi lĩnh vực một lượt, tối đa 3. */
  addTrack(domain: string): Promise<VerifyTrack>;
  /** POST /api/ai/verification/interviews  body { trackId, consent: true } → VerifyInterview. Đang có buổi dở thì trả lại buổi đó. */
  start(trackId: string, consent: boolean): Promise<VerifyInterview>;
  /** GET /api/ai/verification/interviews/{id} → VerifyInterview. Dùng để tiếp tục khi bị gián đoạn (404/410 nếu quá hạn). */
  interview(id: string): Promise<VerifyInterview>;
  /**
   * POST /api/ai/verification/interviews/{id}/answers  (multipart: questionId, transcript, durationSeconds, media = video+âm thanh)
   * → VerifyInterview (có câu hỏi kế tiếp của AI, hoặc status SUBMITTED khi là câu cuối).
   */
  answer(id: string, input: VerifyAnswerInput): Promise<VerifyInterview>;
  /** POST /api/ai/verification/interviews/{id}/heartbeat  body { remainingSeconds } → 204. Lưu đồng hồ để tiếp tục đúng chỗ. */
  heartbeat(id: string, remainingSeconds: number): Promise<void>;
  /** POST /api/ai/verification/interviews/{id}/submit → VerifyResult. Kết thúc và nộp bài, hệ thống chấm điểm. */
  submit(id: string): Promise<VerifyResult>;
  /** GET /api/ai/verification/results/{id} → VerifyResult. */
  result(id: string): Promise<VerifyResult>;
  /** GET /api/ai/verification/history → VerifyHistoryItem[]. Lịch sử các lần phỏng vấn của mentor. */
  history(): Promise<VerifyHistoryItem[]>;
}

export interface VerifyAdminApi {
  /** UNCLEAR chứa ca chờ duyệt. DECIDED chứa ca đã có kết quả của AI hoặc admin. */
  queue(filter: VerifyQueueFilter, q: string): Promise<VerifyQueue>;
  /** GET /api/ai/admin/verification/{id} → VerifyAdminDetail (điểm từng tiêu chí, lý do AI, video và văn bản từng câu). */
  detail(id: string): Promise<VerifyAdminDetail>;
  /** POST /api/ai/admin/verification/{id}/decision  body { decision: APPROVE|REJECT, note, reviewedVideo } → 204. */
  decide(id: string, input: VerifyDecisionInput): Promise<void>;
}

const BASE = "/api/ai/verification";
const ADM = "/api/ai/admin/verification";

const real: { mentor: VerifyMentorApi; admin: VerifyAdminApi } = {
  mentor: {
    overview: () => api<VerifyOverview>(`${BASE}/status`),
    addTrack: (domain) => api<VerifyTrack>(`${BASE}/tracks`, { method: "POST", body: { domain } }),
    start: (trackId, consent) => api<VerifyInterview>(`${BASE}/interviews`, { method: "POST", body: { trackId, consent } }),
    interview: (id) => api<VerifyInterview>(`${BASE}/interviews/${id}`),
    answer: (id, input) => {
      const form = new FormData();
      form.set("questionId", input.questionId);
      form.set("transcript", input.transcript);
      form.set("durationSeconds", String(Math.round(input.durationSeconds)));
      if (input.media) form.set("media", input.media, `answer-${input.questionId}.webm`);
      return api<VerifyInterview>(`${BASE}/interviews/${id}/answers`, { method: "POST", form });
    },
    heartbeat: (id, remainingSeconds) => api<void>(`${BASE}/interviews/${id}/heartbeat`, { method: "POST", body: { remainingSeconds } }),
    submit: (id) => api<VerifyResult>(`${BASE}/interviews/${id}/submit`, { method: "POST" }),
    result: (id) => api<VerifyResult>(`${BASE}/results/${id}`),
    history: () => api<VerifyHistoryItem[]>(`${BASE}/history`),
  },
  admin: {
    queue: (filter, q) => api<VerifyQueue>(`${ADM}/queue?filter=${filter}&q=${encodeURIComponent(q)}`),
    detail: (id) => api<VerifyAdminDetail>(`${ADM}/${id}`),
    decide: (id, body) => api<void>(`${ADM}/${id}/decision`, { method: "POST", body }),
  },
};

export const verifyApi = real.mentor;
export const verifyAdminApi = real.admin;
