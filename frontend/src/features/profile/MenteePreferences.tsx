"use client";

import { useState, type FormEvent } from "react";
import { Alert, type Flash } from "@/components/ui";
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
      setMsg({ ok: "Đã lưu sở thích. Trang gợi ý mentor sẽ dùng các điều kiện này làm bộ lọc mặc định." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save} style={{ maxWidth: 760, marginTop: "var(--spacing-16)" }}>
      <h2>Sở thích tìm mentor</h2>
      <p className="muted small">Bỏ trống mục nào nghĩa là không giới hạn mục đó.</p>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="field">
        <label>Ngày muốn học</label>
        <div className="row small" style={{ flexWrap: "wrap" }}>
          {DAYS.map((d) => (
            <label key={d} className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={days.includes(d)} onChange={() => setDays(toggle(days, d))} /> {DAY_NAMES[d]}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="field">
          <label>Buổi học</label>
          <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay | "")}>
            <option value="">Giờ nào cũng được</option>
            {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => <option key={t} value={t}>{TIME_OF_DAY_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Ngân sách tối đa (đ/giờ)</label>
          <input type="number" min={0} max={100000000} step={10000} value={budget} placeholder="Không giới hạn" onChange={(e) => setBudget(e.target.value)} />
          <div className="hint">Nhập 0 nếu chỉ muốn mentor miễn phí.</div>
        </div>
      </div>
      <div className="field">
        <label>Ngôn ngữ</label>
        <div className="row small">
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
            <label key={l} className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={languages.includes(l)} onChange={() => setLanguages(toggle(languages, l))} /> {LANGUAGE_LABELS[l]}
            </label>
          ))}
        </div>
      </div>
      <button className="btn secondary sm" disabled={busy}>Lưu sở thích</button>
    </form>
  );
}
