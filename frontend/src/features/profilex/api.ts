import { api } from "@/lib/api";
import type { SessionType, Uuid } from "@/types";

/** API bổ sung cho hai trang cá nhân (MentorProfile / MenteeProfile). */

export interface ReviewReaction { helpfulCount: number; marked: boolean }
export const REVIEW_REPORT_REASONS = ["Nội dung không đúng sự thật", "Ngôn từ xúc phạm", "Spam hoặc quảng cáo", "Lý do khác"] as const;

export interface ClassmateProof { names: string[]; total: number }

export interface MenteeMentorLink { mentorId: Uuid; name: string; headline: string; sessions: number }
export interface MentorFeedback { id: string; mentorId: Uuid; mentorName: string; rating: number; period: string; sessionType: SessionType; comment: string }
export interface MenteeExtras {
  joinedAt: string;
  sessionsCompleted: number;
  /** 0..100, null = chưa đủ dữ liệu. */
  onTimeRate: number | null;
  wantedSkills: string[];
  wantedSessionTypes: SessionType[];
  mentors: MenteeMentorLink[];
  feedbacks: MentorFeedback[];
}

export const profilexApi = {
  /** GET /api/mentoring/reviews/{id}/helpful */
  helpful: (reviewId: Uuid): Promise<ReviewReaction> => api<ReviewReaction>(`/api/mentoring/reviews/${reviewId}/helpful`),
  /** POST (đánh dấu) / DELETE (bỏ) /api/mentoring/reviews/{id}/helpful */
  toggleHelpful: (reviewId: Uuid, marked: boolean): Promise<ReviewReaction> =>
    api<ReviewReaction>(`/api/mentoring/reviews/${reviewId}/helpful`, { method: marked ? "POST" : "DELETE" }),
  /** POST /api/mentoring/reviews/{id}/report { reason } -> 204 (đưa vào hàng chờ kiểm duyệt) */
  async reportReview(reviewId: Uuid, reason: string): Promise<void> {
    await api<void>(`/api/mentoring/reviews/${reviewId}/report`, { method: "POST", body: { reason } });
  },
  /** GET /api/profile/mentors/{id}/classmates -> { names, total } */
  classmates: (mentorId: Uuid): Promise<ClassmateProof> => api<ClassmateProof>(`/api/profile/mentors/${mentorId}/classmates`),
  /** GET /api/profile/mentee/{id}/extras -> MenteeExtras */
  menteeExtras: (menteeId: Uuid): Promise<MenteeExtras> => api<MenteeExtras>(`/api/profile/mentee/${menteeId}/extras`),
};
