"use client";

import { useState, type FormEvent } from "react";
import { Alert, type Flash } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, profileApi } from "@/features/profile/api";
import type { BookingSettingsInput, LanguageCode, MentorProfile, SessionType } from "@/types";

const BUFFERS: ReadonlyArray<BookingSettingsInput["bufferMinutes"]> = [0, 15, 30];
const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"];
const MEETING_LINK_RE = /^https:\/\/(meet\.google\.com|zoom\.us|[a-z0-9-]+(\.[a-z0-9-]+)*\.zoom\.us|teams\.microsoft\.com)(\/|$)/i;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** US-04 (PRD-SES-3) — link họp và cài đặt đặt lịch; mentoring-service áp dụng khi mentee đặt phiên. */
export default function BookingSettings({ profile, onChange }: { profile: MentorProfile; onChange: (p: MentorProfile) => void }) {
  const [form, setForm] = useState<BookingSettingsInput>({
    meetingLink: profile.meetingLink || "",
    bufferMinutes: profile.bufferMinutes,
    minNoticeHours: profile.minNoticeHours,
    languages: profile.languages,
    sessionTypes: profile.sessionTypes,
    timezone: profile.timezone,
  });
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);
  const link = (form.meetingLink || "").trim();
  const linkInvalid = link !== "" && !MEETING_LINK_RE.test(link);
  const timezones = TIMEZONES.includes(profile.timezone) ? TIMEZONES : [profile.timezone, ...TIMEZONES];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      const p = await profileApi.saveBookingSettings(profile.userId, { ...form, meetingLink: link || null, minNoticeHours: Number(form.minNoticeHours) });
      onChange(p);
      setMsg({ ok: "Đã lưu cài đặt đặt lịch." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h3>Cài đặt đặt lịch</h3>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="field">
        <label>Link phòng họp</label>
        <input value={form.meetingLink || ""} maxLength={500} placeholder="https://meet.google.com/abc-defg-hij" onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} />
        <div className="hint">{linkInvalid ? "Chỉ nhận link https của Google Meet, Zoom hoặc Microsoft Teams." : "Chỉ gửi cho mentee khi phiên đã xác nhận."}</div>
      </div>
      <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="field">
          <label>Nghỉ giữa các phiên</label>
          <select value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) as BookingSettingsInput["bufferMinutes"] })}>
            {BUFFERS.map((b) => <option key={b} value={b}>{b === 0 ? "Không nghỉ" : `${b} phút`}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Đặt trước tối thiểu (giờ)</label>
          <input type="number" min={1} max={72} required value={form.minNoticeHours} onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })} />
        </div>
      </div>
      <div className="field">
        <label>Ngôn ngữ hướng dẫn</label>
        <div className="row small">
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
            <label key={l} className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={form.languages.includes(l)} onChange={() => setForm({ ...form, languages: toggle(form.languages, l) })} /> {LANGUAGE_LABELS[l]}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Loại phiên nhận</label>
        <div className="row small" style={{ flexWrap: "wrap" }}>
          {(Object.keys(SESSION_TYPE_LABELS) as SessionType[]).map((t) => (
            <label key={t} className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={form.sessionTypes.includes(t)} onChange={() => setForm({ ...form, sessionTypes: toggle(form.sessionTypes, t) })} /> {SESSION_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Múi giờ</label>
        <select value={form.timezone || "Asia/Ho_Chi_Minh"} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <div className="hint">Lịch rảnh, ngày nghỉ và nghỉ phép tính theo múi giờ này.</div>
      </div>
      <button className="btn secondary sm" disabled={busy || linkInvalid || form.languages.length === 0 || form.sessionTypes.length === 0}>
        Lưu cài đặt
      </button>
    </form>
  );
}
