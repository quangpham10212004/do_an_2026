"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, ProgressBar } from "@/components/ui";
import { COMMON_TIMEZONES, profileApi } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import type { Completeness, Uuid } from "@/types";

/** US-37 (PRD-PROF-1) — điểm hoàn thiện hồ sơ + các mục còn thiếu. */
export function CompletenessCard({ completeness, matchingMin }: { completeness: Completeness; matchingMin?: number }) {
  const missing = completeness.items.filter((i) => !i.done);
  return (
    <div className="card stack">
      <div className="row between">
        <h2>Hồ sơ hoàn thiện {completeness.score}%</h2>
        {matchingMin !== undefined && (
          completeness.score >= matchingMin
            ? <Link className="btn sm" href="/matching">Tìm mentor bằng AI</Link>
            : <span className="badge warn">Cần ≥ {matchingMin}% để dùng AI Matching</span>
        )}
      </div>
      <ProgressBar value={completeness.score} />
      {missing.length === 0 ? (
        <div className="small muted">Hồ sơ đã đầy đủ.</div>
      ) : (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {missing.map((i) => <li key={i.key}>{i.label} <span className="muted">(+{i.weight}%)</span></li>)}
        </ul>
      )}
    </div>
  );
}

/** US-37 (PRD-PROF-3, PROF-6) — ảnh đại diện JPG/PNG ≤ 2 MB và múi giờ hiển thị. */
export function AvatarAndTimezone({ userId, avatarUrl, timezone, showTimezone = true, onChange }: {
  userId: Uuid;
  avatarUrl: string | null;
  timezone: string;
  showTimezone?: boolean;
  onChange: () => void;
}) {
  const [tz, setTz] = useState(timezone);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const known = COMMON_TIMEZONES.some(([v]) => v === tz);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      onChange();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h2>Ảnh đại diện{showTimezone ? " & múi giờ" : ""}</h2>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="row" style={{ gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", background: "var(--surface-2, #eee)", flex: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarUrl && <img src={avatarUrl} alt="Ảnh đại diện" width={72} height={72} style={{ objectFit: "cover" }} />}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) {
              setMsg({ error: "Ảnh đại diện tối đa 2 MB" });
              return;
            }
            run(() => profileApi.uploadAvatar(userId, f), "Đã cập nhật ảnh đại diện.");
          }} />
          <span className="hint">JPG hoặc PNG, tối đa 2 MB.</span>
          {avatarUrl && <button type="button" className="btn ghost sm" disabled={busy}
            onClick={() => run(() => profileApi.deleteAvatar(userId), "Đã xoá ảnh đại diện.")}>Xoá ảnh</button>}
        </div>
      </div>
      {showTimezone && (
        <div className="field">
          <label>Múi giờ</label>
          <div className="row">
            <select value={known ? tz : "__other"} onChange={(e) => e.target.value !== "__other" && setTz(e.target.value)}>
              {COMMON_TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!known && <option value="__other">{tz}</option>}
            </select>
            <button type="button" className="btn secondary sm" disabled={busy || tz === timezone}
              onClick={() => run(() => profileApi.saveTimezone(userId, tz), "Đã đổi múi giờ — mọi giờ trên trang hiển thị theo múi giờ này.")}>
              Lưu múi giờ
            </button>
          </div>
          <div className="hint">Giờ phiên học, nhắc lịch và tin nhắn hiển thị theo múi giờ này.</div>
        </div>
      )}
    </div>
  );
}
