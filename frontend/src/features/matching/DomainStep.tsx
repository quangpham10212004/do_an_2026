"use client";

import { Layers, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
import { MAX_MENTEE_DOMAINS } from "@/types";

/**
 * Bước chọn lĩnh vực trước khi tìm: chỉ chọn trong các lĩnh vực của hồ sơ (chính + phụ). Mỗi lĩnh vực được tìm bằng
 * kỹ năng và mục tiêu riêng của nó. Hồ sơ chỉ có một lĩnh vực thì trang bỏ qua bước này.
 */
export default function DomainStep({ domains, primary, value, busy, onChange }: {
  domains: string[];
  primary: string | null;
  /** Lĩnh vực đang chọn; null = chưa chọn (chưa tìm). */
  value: string | null;
  busy: boolean;
  onChange: (domain: string) => void;
}) {
  return (
    <section className="intent-bar" aria-labelledby="domain-step-title">
      <h2 id="domain-step-title" className="intent-title"><Layers aria-hidden="true" />Bạn muốn tìm mentor cho lĩnh vực nào?</h2>
      <div className="intent-pills" role="group" aria-label="Lĩnh vực trong hồ sơ">
        {domains.map((d) => (
          <button key={d} type="button" className="intent-pill" aria-pressed={value === d} disabled={busy} onClick={() => onChange(d)}>
            {domainLabel(d)}{d === primary ? " (chính)" : ""}
          </button>
        ))}
        {domains.length < MAX_MENTEE_DOMAINS && (
          <ButtonLink href="/profile#ld" size="sm" variant="ghost" icon={Plus}>Thêm lĩnh vực</ButtonLink>
        )}
      </div>
      {value === null && <p className="intent-note">Chọn một lĩnh vực để AI bắt đầu tìm. Mỗi lĩnh vực dùng kỹ năng và mục tiêu riêng của nó.</p>}
    </section>
  );
}
