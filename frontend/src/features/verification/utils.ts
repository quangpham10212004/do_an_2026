import type { VerifyStage } from "@/types/verification";

/** 75 -> "1:15" ; 3725 -> "62:05". */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "27/11 · 19:00" */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "27/11" */
export function shortDate(iso: string | null | undefined): string {
  return shortDateTime(iso).split(" · ")[0];
}

/** "2 ngày 18 giờ" / "5 giờ 10 phút" / "Đã quá hạn". */
export function timeLeft(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Đã quá hạn";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${mins % 60} phút`;
  return `${Math.max(1, mins)} phút`;
}

/** Số ngày còn lại (làm tròn lên) tới mốc iso. */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** "Hôm nay" / "Hôm qua" / "2 ngày" tính từ mốc bắt đầu chờ. */
export function waitingLabel(iso: string, overdue: boolean): string {
  if (overdue) return "Quá hạn";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Hôm nay" : days === 1 ? "Hôm qua" : `${days} ngày`;
}

export const fmtScore = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1).replace(".", ","));

/** Chỉ số bước (1-3) đang hiện hành theo trạng thái; các bước nhỏ hơn là đã xong, 4 nghĩa là xong tất cả. */
export function currentStep(stage: VerifyStage): number {
  switch (stage) {
    case "READY": case "IN_PROGRESS": case "EXPIRED": return 2;
    case "PENDING_REVIEW": case "FAILED": return 3;
    case "PASSED": return 4;
  }
}

export const STAGE_LABEL: Record<VerifyStage, string> = {
  READY: "Sẵn sàng phỏng vấn",
  IN_PROGRESS: "Đang phỏng vấn dở",
  PENDING_REVIEW: "Chờ quản trị viên xem xét",
  PASSED: "Đã được xác thực",
  FAILED: "Chưa đạt",
  EXPIRED: "Quá hạn tiếp tục",
};

export const VERIFY_STEPS: { title: string; desc: string }[] = [
  { title: "Hồ sơ chuyên môn", desc: "Đã khai báo lĩnh vực" },
  { title: "Phỏng vấn AI trực tiếp", desc: "Trả lời bằng giọng nói, có quay video" },
  { title: "Kết quả", desc: "AI chấm, chưa rõ thì admin xem xét" },
];

/** Giá trị chung để hiển thị khi backend chưa trả quy định. */
export const DEFAULT_RULES = { maxMinutes: 30, resumeHours: 24, retakeDays: 7, passScore: 3.5 };
