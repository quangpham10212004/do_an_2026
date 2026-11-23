"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { QUICK_INTENTS, inferIntent } from "@/features/findx/api";
import type { MatchIntentValue } from "@/types";

const GOAL_MAX = 500;

/**
 * Ô nhập tự do "Bạn muốn học gì lúc này?" + gợi ý nhanh. Lĩnh vực không còn suy ra ở đây: mentee chọn ở DomainStep
 * (trong các lĩnh vực của hồ sơ). Nếu câu nhập nhắc tới một lĩnh vực khác, gọi `onOtherDomain` để trang hướng dẫn
 * thêm lĩnh vực đó vào hồ sơ; còn lại câu nhập là mục tiêu bổ sung cho lĩnh vực đang chọn.
 */
export default function IntentBar({ value, domains, busy, onChange, onOtherDomain }: {
  value: MatchIntentValue;
  /** Các lĩnh vực trong hồ sơ (chính + phụ). */
  domains: string[];
  busy: boolean;
  onChange: (next: MatchIntentValue) => void;
  onOtherDomain: (domain: string) => void;
}) {
  const [free, setFree] = useState(value.goalText ?? "");
  const run = (text: string, forced?: { mode: "CURRENT" | "SWITCH"; domain?: string }) => {
    const t = text.trim();
    const inferred = forced ?? inferIntent(t);
    setFree(t);
    if (inferred.mode === "SWITCH" && inferred.domain && !domains.includes(inferred.domain)) {
      onOtherDomain(inferred.domain);
      return;
    }
    // Có nhắc tới một lĩnh vực đã có trong hồ sơ thì chuyển sang lĩnh vực đó; không thì giữ lĩnh vực đang chọn.
    const target = inferred.mode === "SWITCH" && inferred.domain ? inferred.domain : value.targetDomain;
    onChange(target ? { mode: "SWITCH", targetDomain: target, goalText: t || undefined } : { mode: "CURRENT", goalText: t || undefined });
  };

  return (
    <section className="intent-bar" aria-label="Mục đích tìm mentor">
      <h2 className="intent-title"><Sparkles aria-hidden="true" />Bạn muốn học gì lúc này?</h2>
      <form className="intent-free" role="search" onSubmit={(e) => { e.preventDefault(); run(free); }}>
        <input type="text" aria-label="Bạn muốn học gì lúc này?" placeholder="Ví dụ: luyện phỏng vấn Java, review dự án cá nhân" maxLength={GOAL_MAX}
          value={free} onChange={(e) => setFree(e.target.value)} disabled={busy} />
        <Button type="submit" variant="secondary" loading={busy}>Tìm bằng AI</Button>
      </form>
      <div className="intent-quick" role="group" aria-label="Gợi ý nhanh">
        <span>Gợi ý:</span>
        {QUICK_INTENTS.map((q) => (
          <button key={q.label} type="button" className="intent-pill" disabled={busy} onClick={() => run(q.text, { mode: q.mode, domain: q.domain })}>{q.label}</button>
        ))}
      </div>
    </section>
  );
}
