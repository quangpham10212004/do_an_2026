"use client";

import { ArrowRightLeft, Compass, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { QUICK_INTENTS, inferIntent } from "@/features/findx/api";
import { DOMAINS, domainLabel } from "@/features/profile/api";
import type { MatchIntentValue } from "@/types";

const GOAL_MAX = 500;

/**
 * Mục đích tìm mentor: ô nhập tự do "Bạn muốn học gì lúc này?" + gợi ý nhanh (được phân tích về hai chế độ có sẵn),
 * và hai chế độ rõ ràng: phát triển trong lĩnh vực hồ sơ, hoặc học thứ mới / chuyển ngách (vd. backend → data).
 * Chế độ chuyển ngách chọn lĩnh vực đích và (tuỳ chọn) mô tả mục tiêu; hồ sơ mentee không bị sửa.
 */
export default function IntentBar({ value, menteeDomain, busy, onChange }: {
  value: MatchIntentValue;
  menteeDomain: string | null;
  busy: boolean;
  onChange: (next: MatchIntentValue) => void;
}) {
  const [target, setTarget] = useState(value.targetDomain ?? "");
  const [goal, setGoal] = useState(value.goalText ?? "");
  const [free, setFree] = useState("");
  /** Ô nhập tự do: suy ra CURRENT/SWITCH từ nội dung; phần còn lại gửi làm mục tiêu (goalText). */
  const runFree = (text: string, forced?: { mode: "CURRENT" | "SWITCH"; domain?: string }) => {
    const t = text.trim();
    const it = forced ?? inferIntent(t);
    setFree(t);
    if (it.mode === "SWITCH" && it.domain) { setTarget(it.domain); setGoal(t); onChange({ mode: "SWITCH", targetDomain: it.domain, goalText: t || undefined }); }
    else onChange({ mode: "CURRENT" });
  };
  const switching = value.mode === "SWITCH";
  const targets = DOMAINS.filter(([v]) => v !== menteeDomain?.toLowerCase());

  return (
    <section className="intent-bar" aria-label="Mục đích tìm mentor">
      <h2 className="intent-title"><Sparkles aria-hidden="true" />Bạn muốn học gì lúc này?</h2>
      <form className="intent-free" role="search" onSubmit={(e) => { e.preventDefault(); runFree(free); }}>
        <input type="text" aria-label="Bạn muốn học gì lúc này?" placeholder="Ví dụ: luyện phỏng vấn Java, hoặc chuyển sang Data / AI" maxLength={GOAL_MAX}
          value={free} onChange={(e) => setFree(e.target.value)} disabled={busy} />
        <Button type="submit" variant="secondary" loading={busy}>Tìm bằng AI</Button>
      </form>
      <div className="intent-quick" role="group" aria-label="Gợi ý nhanh">
        <span>Gợi ý:</span>
        {QUICK_INTENTS.map((q) => (
          <button key={q.label} type="button" className="intent-pill" disabled={busy} onClick={() => runFree(q.text, { mode: q.mode, domain: q.domain })}>{q.label}</button>
        ))}
      </div>
      <div className="intent-pills" role="group" aria-label="Chế độ tìm">
        <button type="button" className="intent-pill" aria-pressed={!switching} disabled={busy}
          onClick={() => !switching || onChange({ mode: "CURRENT" })}>
          <Compass aria-hidden="true" />Phát triển trong {menteeDomain ? domainLabel(menteeDomain) : "lĩnh vực hiện tại"}
        </button>
        <button type="button" className="intent-pill" aria-pressed={switching} disabled={busy}
          onClick={() => switching || onChange({ mode: "SWITCH", targetDomain: target || undefined, goalText: goal || undefined })}>
          <ArrowRightLeft aria-hidden="true" />Học thứ mới / chuyển ngách
        </button>
      </div>
      {switching && (
        <form
          className="intent-panel grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (target) onChange({ mode: "SWITCH", targetDomain: target, goalText: goal.trim() || undefined });
          }}
        >
          <Field label="Lĩnh vực muốn học" id="intent-target" required>
            <Select id="intent-target" value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">Chọn lĩnh vực</option>
              {targets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Bạn muốn đạt điều gì? (không bắt buộc)" id="intent-goal" hint={`${goal.length}/${GOAL_MAX} ký tự`}>
            <Textarea id="intent-goal" value={goal} maxLength={GOAL_MAX} onChange={(e) => setGoal(e.target.value)}
              className="min-h-[64px]" placeholder="Ví dụ: Đang làm backend Java, muốn học machine learning để làm hệ thống đề xuất sản phẩm" />
          </Field>
          <Button variant="primary" type="submit" disabled={!target} loading={busy}>Tìm bằng AI</Button>
        </form>
      )}
      {switching && (
        <p className="intent-note">
          AI tìm mentor ở lĩnh vực đích, dựa trên kỹ năng nền hiện có của bạn và mục tiêu mới. Mentor từng chuyển từ{" "}
          {menteeDomain ? domainLabel(menteeDomain) : "lĩnh vực của bạn"} sang lĩnh vực đó được ưu tiên.
        </p>
      )}
    </section>
  );
}
