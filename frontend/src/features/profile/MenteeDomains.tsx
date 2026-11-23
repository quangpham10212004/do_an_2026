"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { DOMAINS, domainLabel } from "@/features/profile/api";
import { ChipEditor } from "@/features/profile/editKit";
import { MAX_MENTEE_DOMAINS } from "@/types";

export interface ExtraDomainForm {
  domain: string;
  skills: string[];
  goal: string;
}

const GOAL_MAX = 1000;

/**
 * Lĩnh vực học của mentee: lĩnh vực chính (khai ở "Thông tin học tập") và tối đa MAX_MENTEE_DOMAINS - 1 lĩnh vực phụ.
 * Mỗi lĩnh vực phụ có kỹ năng và mục tiêu riêng — khi tìm mentor cho lĩnh vực đó, AI chỉ dùng dữ liệu của lĩnh vực đó.
 */
export default function MenteeDomains({ primary, value, onChange, errors }: {
  primary: string;
  value: ExtraDomainForm[];
  onChange: (next: ExtraDomainForm[]) => void;
  errors: Record<string, string>;
}) {
  const full = value.length + 1 >= MAX_MENTEE_DOMAINS;
  const update = (i: number, patch: Partial<ExtraDomainForm>) => onChange(value.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const taken = (i: number) => new Set([primary, ...value.filter((_, k) => k !== i).map((d) => d.domain)]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-muted">
        Lĩnh vực chính: <b>{primary ? domainLabel(primary) : "chưa chọn"}</b>. Thêm tối đa {MAX_MENTEE_DOMAINS - 1} lĩnh vực nữa nếu bạn muốn học song song;
        khi tìm mentor bạn sẽ chọn một lĩnh vực mỗi lần.
      </p>
      {value.map((d, i) => (
        <fieldset key={i} className="pe-cvbox flex flex-col gap-4" aria-label={`Lĩnh vực phụ ${i + 1}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Lĩnh vực" id={`xd-domain-${i}`} required error={errors[`extra${i}`]} className="min-w-[220px] flex-1">
              <Select id={`xd-domain-${i}`} value={d.domain} aria-invalid={!!errors[`extra${i}`]} onChange={(e) => update(i, { domain: e.target.value })}>
                <option value="">Chọn lĩnh vực</option>
                {DOMAINS.filter(([v]) => !taken(i).has(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Button variant="danger-quiet" icon={Trash2} onClick={() => onChange(value.filter((_, k) => k !== i))}>Bỏ lĩnh vực này</Button>
          </div>
          <div>
            <div className="pe-sub">Kỹ năng đã có ở lĩnh vực này</div>
            <ChipEditor items={d.skills} onChange={(v) => update(i, { skills: v })} label={`Kỹ năng ${d.domain ? domainLabel(d.domain) : "lĩnh vực phụ"}`} placeholder="+ Thêm kỹ năng" />
          </div>
          <Field label="Mục tiêu ở lĩnh vực này" id={`xd-goal-${i}`} hint={`${d.goal.length}/${GOAL_MAX} ký tự`}>
            <Textarea id={`xd-goal-${i}`} rows={3} value={d.goal} maxLength={GOAL_MAX} className="min-h-[88px]"
              placeholder="Ví dụ: Biết đóng gói ứng dụng bằng Docker và dựng CI/CD cho dự án backend của mình"
              onChange={(e) => update(i, { goal: e.target.value })} />
          </Field>
        </fieldset>
      ))}
      <div>
        <Button icon={Plus} disabled={full} onClick={() => onChange([...value, { domain: "", skills: [], goal: "" }])}>
          Thêm lĩnh vực
        </Button>
        {full && <p className="field-hint mt-2">Đã đủ {MAX_MENTEE_DOMAINS} lĩnh vực. Bỏ bớt một lĩnh vực nếu muốn đổi.</p>}
      </div>
    </div>
  );
}
