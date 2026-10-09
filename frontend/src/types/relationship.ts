import type { ActionItem } from "./mentoring";
import type { IsoDateTime, Uuid } from "./common";
import type { SessionType } from "./profile";
import type { RequestFrequency } from "./mentoring";

// contracts/mentoring-service.yaml — "Relationship workspace (US-28)"

export type GoalStatus = "TODO" | "IN_PROGRESS" | "DONE";

export interface RelationshipGoal {
  id: Uuid;
  text: string;
  status: GoalStatus;
  position: number;
  /** null = tạo tự động từ goal của yêu cầu. */
  createdBy: Uuid | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RelationshipSummary {
  id: Uuid;
  mentorId: Uuid;
  mentorName: string | null;
  menteeId: Uuid;
  menteeName: string | null;
  goal: string;
  sessionType: SessionType | null;
  frequency: RequestFrequency | null;
  expectedDurationMonths: number;
  /** Trạng thái yêu cầu: ACCEPTED, COMPLETED, ENDED (US-31)… — chuỗi để không phụ thuộc thời điểm Team A thêm trạng thái. */
  status: string;
  createdAt: IsoDateTime;
  respondedAt: IsoDateTime | null;
}

export interface WorkspaceSession {
  id: Uuid;
  scheduledAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationMinutes: number;
  status: string;
  sessionType: SessionType | null;
  topic: string | null;
}

export interface RelationshipWorkspace {
  request: RelationshipSummary;
  goals: RelationshipGoal[];
  sessions: WorkspaceSession[];
  /** true khi yêu cầu không còn ACCEPTED. */
  readOnly: boolean;
  /** Người xem là một bên tham gia và readOnly = false (admin luôn false). */
  canEdit: boolean;
  maxGoals: number;
  /** US-40 — việc còn mở của cặp (mọi phiên); admin nhận mảng rỗng. */
  openActionItems: ActionItem[];
}

export interface GoalUpdateInput {
  text?: string;
  status?: GoalStatus;
}

/** US-31 (Team A) — POST /api/mentoring/requests/{id}/end */
export type EndMentoringReason = "GOAL_REACHED" | "NO_LONGER_NEEDED" | "NOT_A_FIT" | "OTHER";

export interface EndMentoringInput {
  reason: EndMentoringReason;
  note?: string;
}
