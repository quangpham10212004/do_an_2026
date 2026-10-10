"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, CardBody, CardFooter, CardHeader, Chip, Chips, Field, FlashAlerts, Input, Select, type Flash } from "@/components/ui";
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
      <Card>
        <CardHeader title="Cài đặt đặt lịch" description="Áp dụng khi mentee đặt phiên với bạn." />
        <CardBody className="flex flex-col gap-5">
          <FlashAlerts flash={msg} />
          <Field label="Link phòng họp" id="bs-link"
            error={linkInvalid ? "Chỉ nhận link https của Google Meet, Zoom hoặc Microsoft Teams." : undefined}
            hint="Chỉ gửi cho mentee khi phiên đã xác nhận.">
            <Input id="bs-link" value={form.meetingLink || ""} maxLength={500} placeholder="https://meet.google.com/abc-defg-hij" onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} />
          </Field>
          <div className="form-grid">
            <Field label="Nghỉ giữa các phiên" id="bs-buffer">
              <Select id="bs-buffer" value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) as BookingSettingsInput["bufferMinutes"] })}>
                {BUFFERS.map((b) => <option key={b} value={b}>{b === 0 ? "Không nghỉ" : `${b} phút`}</option>)}
              </Select>
            </Field>
            <Field label="Đặt trước tối thiểu (giờ)" id="bs-notice">
              <Input id="bs-notice" type="number" min={1} max={72} required value={form.minNoticeHours} onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Ngôn ngữ hướng dẫn" error={form.languages.length === 0 ? "Chọn ít nhất một ngôn ngữ." : undefined}>
            <Chips>
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
                <Chip key={l} selected={form.languages.includes(l)} onClick={() => setForm({ ...form, languages: toggle(form.languages, l) })}>{LANGUAGE_LABELS[l]}</Chip>
              ))}
            </Chips>
          </Field>
          <Field label="Loại phiên nhận" error={form.sessionTypes.length === 0 ? "Chọn ít nhất một loại phiên." : undefined}>
            <Chips>
              {(Object.keys(SESSION_TYPE_LABELS) as SessionType[]).map((t) => (
                <Chip key={t} selected={form.sessionTypes.includes(t)} onClick={() => setForm({ ...form, sessionTypes: toggle(form.sessionTypes, t) })}>{SESSION_TYPE_LABELS[t]}</Chip>
              ))}
            </Chips>
          </Field>
          <Field label="Múi giờ" id="bs-tz" hint="Lịch rảnh, ngày nghỉ và nghỉ phép tính theo múi giờ này.">
            <Select id="bs-tz" value={form.timezone || "Asia/Ho_Chi_Minh"} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={busy} disabled={linkInvalid || form.languages.length === 0 || form.sessionTypes.length === 0}>
            Lưu cài đặt
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
