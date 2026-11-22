"use client";

import { useState } from "react";
import { Checkbox, Chip, Chips, Field, FlashAlerts, Input, Select, type Flash } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, profileApi } from "@/features/profile/api";
import type { BookingSettingsInput, LanguageCode, MentorProfile, SessionType } from "@/types";

const BUFFERS: ReadonlyArray<BookingSettingsInput["bufferMinutes"]> = [0, 15, 30];
const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"];
const MEETING_LINK_RE = /^https:\/\/(meet\.google\.com|zoom\.us|[a-z0-9-]+(\.[a-z0-9-]+)*\.zoom\.us|teams\.microsoft\.com)(\/|$)/i;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export const bookingFromProfile = (p: MentorProfile): BookingSettingsInput => ({
  meetingLink: p.meetingLink || "",
  bufferMinutes: p.bufferMinutes,
  minNoticeHours: p.minNoticeHours,
  languages: p.languages,
  sessionTypes: p.sessionTypes,
  timezone: p.timezone,
});

/** Lỗi nhập theo từng ô; rỗng = hợp lệ. */
export function bookingErrors(v: BookingSettingsInput): Record<string, string> {
  const e: Record<string, string> = {};
  const link = (v.meetingLink || "").trim();
  if (link && !/^https:\/\//i.test(link)) e.meetingLink = "Link phải bắt đầu bằng https://";
  else if (link && !MEETING_LINK_RE.test(link)) e.meetingLink = "Chỉ nhận link https của Google Meet, Zoom hoặc Microsoft Teams.";
  if (v.languages.length === 0) e.languages = "Chọn ít nhất một ngôn ngữ.";
  if (v.sessionTypes.length === 0) e.sessionTypes = "Chọn ít nhất một loại phiên.";
  const n = Number(v.minNoticeHours);
  if (!(n >= 1 && n <= 72)) e.minNoticeHours = "Nhập số giờ từ 1 đến 72.";
  return e;
}

/**
 * US-04 (PRD-SES-3) — link họp và cài đặt đặt lịch. Giá trị do trang cha giữ (lưu cùng thanh lưu cố định);
 * riêng bật/tắt buổi trải nghiệm gọi API ngay vì là công tắc.
 */
export default function BookingSettings({ profile, value, onChange, onProfile, errors = {} }: {
  profile: MentorProfile;
  value: BookingSettingsInput;
  onChange: (v: BookingSettingsInput) => void;
  onProfile: (p: MentorProfile) => void;
  errors?: Record<string, string>;
}) {
  const [msg, setMsg] = useState<Flash>({});
  const timezones = TIMEZONES.includes(profile.timezone) ? TIMEZONES : [profile.timezone, ...TIMEZONES];

  async function setTrial(enabled: boolean) {
    setMsg({});
    try {
      onProfile(await profileApi.setTrialEnabled(profile.userId, enabled));
      setMsg({ ok: enabled ? "Đã bật nhận buổi trải nghiệm." : "Đã tắt nhận buổi trải nghiệm." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <FlashAlerts flash={msg} />
      <Checkbox label="Nhận buổi trải nghiệm 15 phút (mentee trả 30.000đ, mỗi mentee một lần)" checked={profile.trialEnabled}
        onChange={() => setTrial(!profile.trialEnabled)} />
      <Field label="Link phòng họp" id="bs-link" error={errors.meetingLink} hint="Chỉ gửi cho mentee khi phiên đã xác nhận.">
        <Input id="bs-link" value={value.meetingLink || ""} maxLength={500} placeholder="https://meet.google.com/abc-defg-hij"
          aria-invalid={!!errors.meetingLink} onChange={(e) => onChange({ ...value, meetingLink: e.target.value })} />
      </Field>
      <div className="form-grid">
        <Field label="Nghỉ giữa các phiên" id="bs-buffer">
          <Select id="bs-buffer" value={value.bufferMinutes} onChange={(e) => onChange({ ...value, bufferMinutes: Number(e.target.value) as BookingSettingsInput["bufferMinutes"] })}>
            {BUFFERS.map((b) => <option key={b} value={b}>{b === 0 ? "Không nghỉ" : `${b} phút`}</option>)}
          </Select>
        </Field>
        <Field label="Đặt trước tối thiểu (giờ)" id="bs-notice" error={errors.minNoticeHours}>
          <Input id="bs-notice" type="number" min={1} max={72} value={value.minNoticeHours} aria-invalid={!!errors.minNoticeHours}
            onChange={(e) => onChange({ ...value, minNoticeHours: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Ngôn ngữ hướng dẫn" error={errors.languages}>
        <Chips>
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
            <Chip key={l} selected={value.languages.includes(l)} onClick={() => onChange({ ...value, languages: toggle(value.languages, l) })}>{LANGUAGE_LABELS[l]}</Chip>
          ))}
        </Chips>
      </Field>
      <Field label="Loại phiên nhận" error={errors.sessionTypes}>
        <Chips>
          {(Object.keys(SESSION_TYPE_LABELS) as SessionType[]).map((t) => (
            <Chip key={t} selected={value.sessionTypes.includes(t)} onClick={() => onChange({ ...value, sessionTypes: toggle(value.sessionTypes, t) })}>{SESSION_TYPE_LABELS[t]}</Chip>
          ))}
        </Chips>
      </Field>
      <Field label="Múi giờ" id="bs-tz" hint="Lịch rảnh, ngày nghỉ và nghỉ phép tính theo múi giờ này.">
        <Select id="bs-tz" value={value.timezone || "Asia/Ho_Chi_Minh"} onChange={(e) => onChange({ ...value, timezone: e.target.value })}>
          {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </Select>
      </Field>
    </div>
  );
}
