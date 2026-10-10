"use client";

import { useId, useState } from "react";
import { Check, Circle, Sparkles, Trash2, Upload } from "lucide-react";
import { Avatar, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Field, FlashAlerts, Progress, Select, type Flash } from "@/components/ui";
import { COMMON_TIMEZONES, profileApi } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import type { Completeness, Uuid } from "@/types";

/** US-37 (PRD-PROF-1) — điểm hoàn thiện hồ sơ + các mục còn thiếu. */
export function CompletenessCard({ completeness, matchingMin }: { completeness: Completeness; matchingMin?: number }) {
  const missing = completeness.items.filter((i) => !i.done);
  return (
    <Card>
      <CardHeader
        title={`Hồ sơ hoàn thiện ${completeness.score}%`}
        description={missing.length ? "Hoàn thiện các mục còn thiếu để được gợi ý chính xác hơn." : "Hồ sơ đã đầy đủ."}
        actions={matchingMin !== undefined && (
          completeness.score >= matchingMin
            ? <ButtonLink size="sm" icon={Sparkles} href="/matching">Tìm mentor bằng AI</ButtonLink>
            : <Badge tone="warning">Cần từ {matchingMin}% để dùng AI Matching</Badge>
        )}
      />
      <CardBody className="flex flex-col gap-4">
        <Progress value={completeness.score} label="Mức hoàn thiện hồ sơ" />
        {completeness.items.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-6 gap-y-1.5">
            {completeness.items.map((i) => (
              <li key={i.key} className={`flex items-center gap-2 ${i.done ? "text-ink-muted" : ""}`}>
                {i.done
                  ? <Check aria-hidden="true" className="size-4 text-success" />
                  : <Circle aria-hidden="true" className="size-4 text-ink-subtle" />}
                <span className={i.done ? "line-through" : ""}>{i.label}</span>
                {!i.done && <span className="text-small text-ink-subtle tabular">+{i.weight}%</span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** US-37 (PRD-PROF-3, PROF-6) — ảnh đại diện JPG/PNG ≤ 2 MB và múi giờ hiển thị. */
export function AvatarAndTimezone({ userId, name, avatarUrl, timezone, showTimezone = true, onChange }: {
  userId: Uuid;
  name?: string | null;
  avatarUrl: string | null;
  timezone: string;
  showTimezone?: boolean;
  onChange: () => void;
}) {
  const [tz, setTz] = useState(timezone);
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);
  const known = COMMON_TIMEZONES.some(([v]) => v === tz);
  const fileId = useId();

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
    <Card>
      <CardHeader title={showTimezone ? "Ảnh đại diện và múi giờ" : "Ảnh đại diện"} />
      <CardBody className="flex flex-col gap-5">
        <FlashAlerts flash={msg} />
        <div className="flex items-center gap-4">
          <Avatar name={name} src={avatarUrl} size="xl" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <label htmlFor={fileId} className={`btn btn-sm ${busy ? "pointer-events-none opacity-50" : ""}`}>
                <Upload aria-hidden="true" />
                Tải ảnh lên
              </label>
              <input id={fileId} type="file" accept="image/jpeg,image/png" className="sr-only" disabled={busy} onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) {
                  setMsg({ error: "Ảnh đại diện tối đa 2 MB. Chọn ảnh nhỏ hơn." });
                  return;
                }
                run(() => profileApi.uploadAvatar(userId, f), "Đã cập nhật ảnh đại diện.");
              }} />
              {avatarUrl && (
                <Button size="sm" variant="ghost" icon={Trash2} disabled={busy}
                  onClick={() => run(() => profileApi.deleteAvatar(userId), "Đã xoá ảnh đại diện.")}>Xoá ảnh</Button>
              )}
            </div>
            <span className="field-hint">JPG hoặc PNG, tối đa 2 MB.</span>
          </div>
        </div>
        {showTimezone && (
          <Field label="Múi giờ" id="profile-tz" hint="Giờ phiên học, nhắc lịch và tin nhắn hiển thị theo múi giờ này.">
            <div className="input-group">
              <Select id="profile-tz" value={known ? tz : "__other"} onChange={(e) => e.target.value !== "__other" && setTz(e.target.value)}>
                {COMMON_TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {!known && <option value="__other">{tz}</option>}
              </Select>
              <Button disabled={busy || tz === timezone}
                onClick={() => run(() => profileApi.saveTimezone(userId, tz), "Đã đổi múi giờ. Mọi giờ trên trang hiển thị theo múi giờ này.")}>
                Lưu
              </Button>
            </div>
          </Field>
        )}
      </CardBody>
    </Card>
  );
}
