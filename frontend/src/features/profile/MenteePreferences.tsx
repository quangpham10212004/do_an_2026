"use client";

import { Chip, Chips, Field, Input, Select } from "@/components/ui";
import { DAY_NAMES } from "@/lib/format";
import { LANGUAGE_LABELS, TIME_OF_DAY_LABELS } from "@/features/profile/api";
import type { LanguageCode, MenteePreferences as Preferences, MenteeProfile, TimeOfDay } from "@/types";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Giá trị form: ngân sách giữ chuỗi người dùng nhập, đổi sang số khi lưu. */
export interface PrefsForm {
  days: number[];
  timeOfDay: TimeOfDay | "";
  budget: string;
  languages: LanguageCode[];
}

export const prefsFromProfile = (p: MenteeProfile): PrefsForm => ({
  days: p.preferredDays,
  timeOfDay: p.preferredTimeOfDay || "",
  budget: p.budgetMaxPerHour === null ? "" : String(p.budgetMaxPerHour),
  languages: p.languages,
});

export const prefsToInput = (f: PrefsForm): Preferences => ({
  preferredDays: [...f.days].sort((a, b) => a - b),
  preferredTimeOfDay: f.timeOfDay || null,
  budgetMaxPerHour: f.budget.trim() === "" ? null : Number(f.budget),
  languages: f.languages,
});

export function prefsErrors(f: PrefsForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.budget.trim() !== "") {
    const n = Number(f.budget);
    if (!(n >= 100000 && n <= 100000000)) e.budget = "Nhập từ 100.000 đến 100.000.000 đ/giờ, hoặc để trống nếu không giới hạn.";
  }
  return e;
}

/**
 * US-16 (PRD-PROF-2) — "Những lưu ý khi tìm mentor". AI Matching dùng làm bộ lọc mặc định (US-17); mentee vẫn
 * đổi được bộ lọc cho từng lượt tìm trên trang /matching. Giá trị do trang cha giữ, lưu cùng thanh lưu cố định.
 */
export default function MenteePreferences({ value, onChange, errors = {} }: { value: PrefsForm; onChange: (v: PrefsForm) => void; errors?: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Ngày muốn học">
        <Chips>
          {DAYS.map((d) => (
            <Chip key={d} selected={value.days.includes(d)} onClick={() => onChange({ ...value, days: toggle(value.days, d) })}>{DAY_NAMES[d]}</Chip>
          ))}
        </Chips>
      </Field>
      <div className="form-grid">
        <Field label="Buổi học" id="pref-time">
          <Select id="pref-time" value={value.timeOfDay} onChange={(e) => onChange({ ...value, timeOfDay: e.target.value as TimeOfDay | "" })}>
            <option value="">Giờ nào cũng được</option>
            {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => <option key={t} value={t}>{TIME_OF_DAY_LABELS[t]}</option>)}
          </Select>
        </Field>
        <Field label="Ngân sách tối đa (đ / giờ)" id="pref-budget" error={errors.budget} hint="Để trống nếu không giới hạn. Học phí từ 100.000 đ/buổi 60 phút.">
          <Input id="pref-budget" type="number" inputMode="numeric" min={100000} max={100000000} step={10000} value={value.budget} placeholder="Không giới hạn"
            aria-invalid={!!errors.budget} onChange={(e) => onChange({ ...value, budget: e.target.value })} />
        </Field>
      </div>
      <Field label="Ngôn ngữ">
        <Chips>
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
            <Chip key={l} selected={value.languages.includes(l)} onClick={() => onChange({ ...value, languages: toggle(value.languages, l) })}>{LANGUAGE_LABELS[l]}</Chip>
          ))}
        </Chips>
      </Field>
    </div>
  );
}
