import { api } from "@/lib/api";
import type { LanguageCode, SessionType, TimeOfDay } from "@/types";

/** Lịch rảnh, sức chứa và số phiên đã hoàn thành dùng trên thẻ mentor. */

export interface MentorExtra {
  userId: string;
  sessionCount: number;
  /** Số chỗ nhận mentee còn lại; null = không rõ. */
  slotsLeft: number | null;
  trialMinutes: number | null;
  days: number[];
  timeOfDay: TimeOfDay[];
  sessionTypes: SessionType[];
  languages: LanguageCode[];
}

/** Đủ để lấy phần mở rộng cho cả MentorCard và RankedMentor. */
export type ExtraSeed = { userId: string };

export const findxApi = {
  extras: async (mentors: ExtraSeed[]): Promise<Record<string, MentorExtra>> => {
    if (!mentors.length) return {};
    const query = new URLSearchParams({ ids: mentors.map((mentor) => mentor.userId).join(",") });
    const [profiles, counts] = await Promise.all([
      api<Omit<MentorExtra, "sessionCount">[]>(`/api/profile/mentors/extras?${query}`),
      api<Record<string, number>>(`/api/mentoring/mentors/completed-counts?${query}`),
    ]);
    return Object.fromEntries(profiles.map((profile) => [
      profile.userId, { ...profile, sessionCount: counts[profile.userId] ?? 0 },
    ]));
  },
};

/** Gợi ý nhanh cho ô "Bạn muốn học gì lúc này?" (map sang CURRENT/SWITCH ở IntentBar). */
export const QUICK_INTENTS: { label: string; text: string; mode: "CURRENT" | "SWITCH"; domain?: string }[] = [
  { label: "Luyện phỏng vấn", text: "Luyện phỏng vấn kỹ thuật", mode: "CURRENT" },
  { label: "Review dự án cá nhân", text: "Review dự án cá nhân của tôi", mode: "CURRENT" },
  { label: "Định hướng nghề nghiệp", text: "Định hướng nghề nghiệp cho 6 tháng tới", mode: "CURRENT" },
  { label: "Tìm mentor Data / AI", text: "Chuyển sang lĩnh vực Data / AI", mode: "SWITCH", domain: "data" },
];

/** Từ khoá tự do -> lĩnh vực đích (chuyển ngách); không khớp thì giữ CURRENT. */
export function inferIntent(text: string): { mode: "CURRENT" | "SWITCH"; domain?: string } {
  const t = text.toLowerCase();
  const map: [RegExp, string][] = [
    [/data|ai\b|machine learning|ml\b/, "data"], [/devops|cloud|kubernetes/, "devops"],
    [/mobile|android|ios|flutter/, "mobile"], [/frontend|react|vue/, "frontend"], [/backend|java|spring/, "backend"],
  ];
  if (/chuyển|học (thứ )?mới|đổi sang/.test(t)) for (const [re, d] of map) if (re.test(t)) return { mode: "SWITCH", domain: d };
  return { mode: "CURRENT" };
}
