"use client";

import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Field, FlashAlerts, Input, type Flash } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { MENTOR_STATUS_LABELS, mentorStatusText, profileApi } from "@/features/profile/api";
import type { MentorProfile, MentorStatusInput } from "@/types";

type SelfStatus = MentorStatusInput["status"];
const CHOICES: ReadonlyArray<[SelfStatus, string]> = [
  ["ACCEPTING", "Nhận mentee mới và được gợi ý trong AI Matching"],
  ["PAUSED", "Không nhận mentee mới, ẩn khỏi gợi ý cho tới khi bạn bật lại"],
  ["ON_LEAVE", "Nghỉ tới hết ngày đã chọn, sau đó tự động nhận mentee trở lại"],
];

/** US-08 (PRD-PROF-5) — mentor tự đổi trạng thái; SUSPENDED chỉ quản trị viên gỡ được. */
export default function MentorStatusControl({ profile, onChange }: { profile: MentorProfile; onChange: (p: MentorProfile) => void }) {
  const [status, setStatus] = useState<SelfStatus>(profile.status === "SUSPENDED" ? "ACCEPTING" : profile.status);
  const [until, setUntil] = useState(profile.onLeaveUntil || "");
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);

  if (profile.status === "SUSPENDED") {
    return (
      <Alert tone="warning" title="Tài khoản mentor đang bị đình chỉ">
        Bạn không xuất hiện trong tìm kiếm, gợi ý và không nhận được yêu cầu mới.
        {profile.statusReason && <> Lý do: {profile.statusReason}.</>} Liên hệ quản trị viên để được gỡ đình chỉ.
      </Alert>
    );
  }

  async function save() {
    setBusy(true);
    setMsg({});
    try {
      const p = await profileApi.changeStatus(profile.userId, { status, onLeaveUntil: status === "ON_LEAVE" ? until || null : null });
      onChange(p);
      setMsg({ ok: `Đã chuyển sang: ${mentorStatusText(p.status, p.onLeaveUntil)}.` });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Trạng thái nhận mentee" description={<>Hiện tại: <strong className="text-ink">{mentorStatusText(profile.status, profile.onLeaveUntil)}</strong></>} />
      <CardBody className="flex flex-col gap-4">
        <FlashAlerts flash={msg} />
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Trạng thái nhận mentee">
          {CHOICES.map(([value, hint]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${status === value ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-hover"}`}>
              <input type="radio" name="mentor-status" className="mt-1 accent-[var(--accent)]" checked={status === value} onChange={() => setStatus(value)} />
              <span>
                <span className="block font-semibold">{MENTOR_STATUS_LABELS[value]}</span>
                <span className="text-small text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {status === "ON_LEAVE" && (
          <Field label="Nghỉ đến hết ngày" id="leave-until" required>
            <Input id="leave-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} required className="max-w-[220px]" />
          </Field>
        )}
        <div>
          <Button variant="primary" loading={busy} disabled={status === "ON_LEAVE" && !until} onClick={save}>Lưu trạng thái</Button>
        </div>
      </CardBody>
    </Card>
  );
}
