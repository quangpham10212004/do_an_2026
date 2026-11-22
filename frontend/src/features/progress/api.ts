import { api } from "@/lib/api";
import type { Uuid } from "@/types";

/** Điểm mentor chấm mentee sau mỗi phiên — nguồn dữ liệu cho dashboard tiến độ. */

/** Một lần mentor chấm mentee (thang 1–5). */
export interface MenteeScore {
  sessionId: Uuid;
  /** Ngày diễn ra phiên (ISO). */
  date: string;
  preparation: number;
  participation: number;
  /** Nhận xét của mentor; null nếu mentor không viết. */
  comment: string | null;
  mentorName: string;
  /** Tên loại phiên để hiện "Phiên 8 · Review code" (không bắt buộc). */
  topic?: string | null;
}

export interface FeedbackTag {
  label: string;
  count: number;
}

/** Tổng hợp "Mentor nhận xét về bạn" + tỉ lệ đúng giờ. */
export interface FeedbackSummary {
  strengths: FeedbackTag[];
  improvements: FeedbackTag[];
  /** 0–100; null khi chưa có dữ liệu. */
  punctualityRate: number | null;
}

export const progressApi = {
  /**
   * GET /api/mentoring/mentees/{menteeId}/scores?from=&to=
   * -> MenteeScore[] sắp xếp theo date tăng dần. Mentee chỉ đọc điểm của chính mình.
   */
  listScores: async (menteeId: Uuid, mentorId?: Uuid): Promise<MenteeScore[]> => {
    return api<MenteeScore[]>(`/api/mentoring/mentees/${menteeId}/scores` + (mentorId ? `?mentorId=${mentorId}` : ""));
  },
  /**
   * GET /api/mentoring/mentees/{menteeId}/feedback-summary
   * -> FeedbackSummary (thẻ điểm mạnh / nên cải thiện tổng hợp từ nhận xét mentor + % đúng giờ theo nhật ký phòng học).
   */
  feedbackSummary: async (menteeId: Uuid): Promise<FeedbackSummary> => {
    return api<FeedbackSummary>(`/api/mentoring/mentees/${menteeId}/feedback-summary`);
  },
};
