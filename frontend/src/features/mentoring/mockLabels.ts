import type { MockInterviewType, MockLevel, MockVerdict } from "@/types";

/** US-58 — nhãn phỏng vấn thử (PRD §6.5). */
export const MOCK_TYPES: MockInterviewType[] = ["BACKEND", "FRONTEND", "SYSTEM_DESIGN", "BEHAVIORAL"];
export const MOCK_TYPE_LABELS: Record<MockInterviewType, string> = {
  BACKEND: "Backend",
  FRONTEND: "Frontend",
  SYSTEM_DESIGN: "System design",
  BEHAVIORAL: "Hành vi (STAR)",
};

export const MOCK_LEVELS: MockLevel[] = ["INTERN", "FRESHER", "JUNIOR"];
export const MOCK_LEVEL_LABELS: Record<MockLevel, string> = { INTERN: "Thực tập", FRESHER: "Fresher", JUNIOR: "Junior" };

export const MOCK_VERDICTS: MockVerdict[] = ["STRONG_HIRE", "HIRE", "LEAN_NO", "NO_HIRE"];
export const MOCK_VERDICT_LABELS: Record<MockVerdict, string> = {
  STRONG_HIRE: "Chắc chắn tuyển",
  HIRE: "Tuyển",
  LEAN_NO: "Nghiêng về không",
  NO_HIRE: "Không tuyển",
};
export const MOCK_VERDICT_TONE: Record<MockVerdict, "success" | "info" | "warning" | "danger"> = {
  STRONG_HIRE: "success",
  HIRE: "info",
  LEAN_NO: "warning",
  NO_HIRE: "danger",
};

/** 4 tiêu chí chung (cùng thang 0–10 với AI practice sau này) + mô tả 3 mức điểm. */
export const MOCK_DIMENSIONS = [
  { key: "technical", label: "Độ chính xác kỹ thuật", bands: ["Sai hoặc lạc đề", "Đúng nhưng chung chung", "Đúng, nêu được đánh đổi và giới hạn"] },
  { key: "problemSolving", label: "Giải quyết vấn đề", bands: ["Không có hướng, nhảy ngay vào đáp án", "Hướng làm ổn, chưa thấy lỗ hổng", "Hỏi lại yêu cầu, chia nhỏ, kiểm tra trường hợp biên"] },
  { key: "depth", label: "Chiều sâu / kinh nghiệm", bands: ["Không có ví dụ cụ thể", "Một ví dụ, ít chi tiết", "Dự án thật, có số liệu, giải thích quyết định"] },
  { key: "communication", label: "Giao tiếp", bands: ["Khó theo dõi", "Hiểu được", "Mạch lạc, ngắn gọn, nói ra suy nghĩ"] },
] as const;

export type MockDimensionKey = (typeof MOCK_DIMENSIONS)[number]["key"];

/** Mô tả mức điểm theo thang 0–2 / 3–6 / 7–10. */
export function bandOf(score: number, bands: readonly string[]): string {
  return score <= 2 ? bands[0] : score <= 6 ? bands[1] : bands[2];
}
