/**
 * Chat trong phòng học và nút hành động trên thông báo. Mọi lời gọi đều tới backend (mentoring-service).
 */
import { api } from "@/lib/api";
import type { Notification, Uuid } from "@/types";

/* ------------------------------------------------------------------ chat trong phòng */

export interface RoomChatMessage {
  id: string;
  sessionId: Uuid;
  /** true nếu do chính người đang xem gửi. */
  mine: boolean;
  senderName: string;
  text: string;
  sentAt: string;
}

export const roomChatApi = {
  /** GET /api/mentoring/sessions/{id}/room-chat */
  list: (sessionId: Uuid): Promise<RoomChatMessage[]> => api<RoomChatMessage[]>(`/api/mentoring/sessions/${sessionId}/room-chat`),
  /** POST /api/mentoring/sessions/{id}/room-chat  body { text } (tên người gửi do server lấy từ hồ sơ). */
  send: (sessionId: Uuid, text: string): Promise<RoomChatMessage> =>
    api<RoomChatMessage>(`/api/mentoring/sessions/${sessionId}/room-chat`, { method: "POST", body: { text } }),
};

/* ------------------------------------------------------------------ thông báo */

/** Nút hành động trên thẻ thông báo (thiết kế: "Đặt lịch ngay"). Suy ra từ mã loại; chỉ hiện khi có link. */
export function notificationAction(n: Pick<Notification, "type" | "link">): string | null {
  if (!n.link) return null;
  const t = n.type.toUpperCase();
  if (/REQUEST.*(ACCEPT|APPROV)|ACCEPT/.test(t)) return "Đặt lịch ngay";
  if (/REVIEW/.test(t)) return "Xem đánh giá";
  if (/(SESSION|REMINDER).*(START|SOON|REMIND)|REMINDER/.test(t)) return "Vào phòng";
  if (/COUPON|REFERRAL|PROMO/.test(t)) return "Xem mã";
  return null;
}
