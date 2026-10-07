import { api } from "@/lib/api";
import type {
  EndMentoringInput,
  EndMentoringReason,
  GoalStatus,
  GoalUpdateInput,
  MentoringRequest,
  RelationshipGoal,
  RelationshipWorkspace,
  Uuid,
} from "@/types";

// US-28 — không gian mentoring (mentoring-service, phần do Team B sở hữu). Đặt cạnh trang để không sửa
// features/mentoring (Team A).
export const workspaceApi = {
  get: (id: Uuid) => api<RelationshipWorkspace>(`/api/mentoring/relationships/${id}`),
  addGoal: (id: Uuid, text: string) =>
    api<RelationshipGoal>(`/api/mentoring/relationships/${id}/goals`, { method: "POST", body: { text } }),
  updateGoal: (id: Uuid, goalId: Uuid, body: GoalUpdateInput) =>
    api<RelationshipGoal>(`/api/mentoring/relationships/${id}/goals/${goalId}`, { method: "PUT", body }),
  deleteGoal: (id: Uuid, goalId: Uuid) =>
    api<null>(`/api/mentoring/relationships/${id}/goals/${goalId}`, { method: "DELETE" }),
  reorder: (id: Uuid, goalIds: Uuid[]) =>
    api<RelationshipGoal[]>(`/api/mentoring/relationships/${id}/goals/order`, { method: "PUT", body: { goalIds } }),
  /** US-31 (Team A) — kết thúc quan hệ mentoring. */
  end: (id: Uuid, body: EndMentoringInput) =>
    api<MentoringRequest>(`/api/mentoring/requests/${id}/end`, { method: "POST", body }),
  /** Quan hệ của tôi = yêu cầu đã từng được chấp nhận. */
  mine: () =>
    api<MentoringRequest[]>("/api/mentoring/requests").then((rs) => rs.filter((r) => !NEVER_ACCEPTED.includes(r.status))),
};

const NEVER_ACCEPTED: string[] = ["PENDING", "REJECTED", "CANCELLED", "EXPIRED"];

export const GOAL_TEXT_MIN = 5;
export const GOAL_TEXT_MAX = 300;

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  TODO: "Chưa bắt đầu",
  IN_PROGRESS: "Đang thực hiện",
  DONE: "Đã xong",
};
export const GOAL_STATUSES = Object.keys(GOAL_STATUS_LABELS) as GoalStatus[];

export const END_REASON_LABELS: Record<EndMentoringReason, string> = {
  GOAL_REACHED: "Đã đạt mục tiêu",
  NO_LONGER_NEEDED: "Không còn nhu cầu",
  NOT_A_FIT: "Không phù hợp",
  OTHER: "Lý do khác",
};
export const END_REASONS = Object.keys(END_REASON_LABELS) as EndMentoringReason[];

/** Nhãn trạng thái quan hệ (gồm ENDED của US-31, có thể chưa có trong STATUS_LABELS chung). */
export const RELATIONSHIP_STATUS_LABELS: Record<string, string> = {
  ACCEPTED: "Đang mentoring",
  COMPLETED: "Đã hoàn thành",
  ENDED: "Đã kết thúc",
};
