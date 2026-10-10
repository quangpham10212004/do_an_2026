"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, CardBody, CardFooter, CardHeader, Chip, Chips, Field, FlashAlerts, Input, Select, type Flash } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { DAY_NAMES } from "@/lib/format";
import { LANGUAGE_LABELS, TIME_OF_DAY_LABELS, profileApi } from "@/features/profile/api";
import type { LanguageCode, MenteePreferences as Preferences, MenteeProfile, TimeOfDay } from "@/types";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/**
 * US-16 (PRD-PROF-2) — sở thích tìm mentor. AI Matching dùng làm bộ lọc mặc định (US-17); mentee vẫn
 * đổi được bộ lọc cho từng lượt tìm trên trang /matching mà không cần lưu lại ở đây.
 */
export default function MenteePreferences({ profile, onChange }: { profile: MenteeProfile; onChange: (p: MenteeProfile) => void }) {
  const [days, setDays] = useState<number[]>(profile.preferredDays);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | "">(profile.preferredTimeOfDay || "");
  const [budget, setBudget] = useState(profile.budgetMaxPerHour === null ? "" : String(profile.budgetMaxPerHour));
  const [languages, setLanguages] = useState<LanguageCode[]>(profile.languages);
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    const body: Preferences = {
      preferredDays: [...days].sort((a, b) => a - b),
      preferredTimeOfDay: timeOfDay || null,
      budgetMaxPerHour: budget.trim() === "" ? null : Number(budget),
      languages,
    };
    try {
      onChange(await profileApi.saveMenteePreferences(profile.userId, body));
      setMsg({ ok: "Đã lưu sở thích. AI Matching sẽ dùng các điều kiện này làm bộ lọc mặc định." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <Card>
        <CardHeader title="Sở thích tìm mentor" description="Bỏ trống mục nào nghĩa là không giới hạn mục đó." />
        <CardBody className="flex flex-col gap-5">
          <FlashAlerts flash={msg} />
          <Field label="Ngày muốn học">
            <Chips>
              {DAYS.map((d) => (
                <Chip key={d} selected={days.includes(d)} onClick={() => setDays(toggle(days, d))}>{DAY_NAMES[d]}</Chip>
              ))}
            </Chips>
          </Field>
          <div className="form-grid">
            <Field label="Buổi học" id="pref-time">
              <Select id="pref-time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay | "")}>
                <option value="">Giờ nào cũng được</option>
                {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => <option key={t} value={t}>{TIME_OF_DAY_LABELS[t]}</option>)}
              </Select>
            </Field>
            <Field label="Ngân sách tối đa (đ/giờ)" id="pref-budget" hint="Nhập 0 nếu chỉ muốn mentor miễn phí.">
              <Input id="pref-budget" type="number" min={0} max={100000000} step={10000} value={budget} placeholder="Không giới hạn" onChange={(e) => setBudget(e.target.value)} />
            </Field>
          </div>
          <Field label="Ngôn ngữ">
            <Chips>
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
                <Chip key={l} selected={languages.includes(l)} onClick={() => setLanguages(toggle(languages, l))}>{LANGUAGE_LABELS[l]}</Chip>
              ))}
            </Chips>
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={busy}>Lưu sở thích</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
