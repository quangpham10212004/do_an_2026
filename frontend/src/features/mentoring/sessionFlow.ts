import type { MentoringSession } from "@/types";

/** Bản chốt v2.0 §6 — phòng học mở 10 phút trước giờ bắt đầu, đóng 30 phút sau giờ kết thúc. */
const JOIN_EARLY_MS = 10 * 60 * 1000;
const JOIN_LATE_MS = 30 * 60 * 1000;

export function canJoin(s: MentoringSession, now = Date.now()): boolean {
  return now >= new Date(s.scheduledAt).getTime() - JOIN_EARLY_MS && now <= new Date(s.endsAt).getTime() + JOIN_LATE_MS;
}

/** US-12 — đang trong thời hạn xác nhận tham dự (job có thể chưa kịp chuyển CONFIRMED → AWAITING_ATTENDANCE). */
export function attendanceOpen(s: MentoringSession, now = Date.now()): boolean {
  const ended = now >= new Date(s.endsAt).getTime();
  const beforeDeadline = now < new Date(s.attendanceDeadline).getTime();
  return (s.status === "AWAITING_ATTENDANCE" || (s.status === "CONFIRMED" && ended)) && beforeDeadline;
}

/** "01:24:10" từ số mili giây còn lại (không âm). */
export function formatCountdown(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}
