"use client";

import { useState } from "react";
import { Alert, type Flash } from "@/components/ui";
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
      <Alert type="warn">
        <strong>Tài khoản mentor đang bị đình chỉ.</strong> Bạn không xuất hiện trong tìm kiếm/gợi ý và không nhận được yêu cầu mới.
        {profile.statusReason && <> Lý do: {profile.statusReason}.</>} Vui lòng liên hệ quản trị viên.
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
    <div>
      <h3>Trạng thái nhận mentee</h3>
      <p className="small">Hiện tại: <strong>{mentorStatusText(profile.status, profile.onLeaveUntil)}</strong></p>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      {CHOICES.map(([value, hint]) => (
        <label key={value} className="row small" style={{ gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
          <input type="radio" name="mentor-status" checked={status === value} onChange={() => setStatus(value)} />
          <span><strong>{MENTOR_STATUS_LABELS[value]}</strong> — <span className="muted">{hint}</span></span>
        </label>
      ))}
      {status === "ON_LEAVE" && (
        <div className="field">
          <label>Nghỉ đến hết ngày</label>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} required />
        </div>
      )}
      <button type="button" className="btn secondary sm" disabled={busy || (status === "ON_LEAVE" && !until)} onClick={save}>
        Lưu trạng thái
      </button>
    </div>
  );
}
