import type { Uuid } from "./common";

// US-33 (PRD-MSG-1..4) — nhắn tin trong yêu cầu / quan hệ mentoring (mentoring-service).

export type MessageSenderRole = "MENTEE" | "MENTOR";
export type MessageReportReason = "SPAM" | "HARASSMENT" | "OFF_PLATFORM_PAYMENT" | "OTHER";
export type MessageReportStatus = "OPEN" | "RESOLVED";
export type MessageReportOutcome = "DISMISSED" | "WARNED";

export interface ChatMessage {
  id: Uuid;
  senderId: Uuid;
  senderRole: MessageSenderRole;
  /** Đã che SĐT/email khi cặp chưa có phiên trả phí được xác nhận. */
  body: string;
  mine: boolean;
  createdAt: string;
}

/** id = id yêu cầu mentoring. */
export interface ConversationSummary {
  id: Uuid;
  counterpartId: Uuid;
  counterpartName: string | null;
  counterpartRole: MessageSenderRole;
  requestStatus: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastFromMe: boolean;
  unread: number;
  writable: boolean;
}

export interface ConversationView {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  contactsMasked: boolean;
  /** null = không giới hạn. */
  remainingBeforeAccept: number | null;
  readOnlyAt: string | null;
  pollIntervalSeconds: number;
}

export interface MessageReport {
  id: Uuid;
  conversationId: Uuid;
  reporterId: Uuid;
  reporterName: string | null;
  reason: MessageReportReason;
  note: string | null;
  status: MessageReportStatus;
  outcome: MessageReportOutcome | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reportedMessage: ChatMessage | null;
  senderName: string | null;
  /** Chỉ có ở chi tiết khi hồ sơ còn OPEN. */
  thread: ChatMessage[] | null;
}
