"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { initials } from "@/components/ui";
import FlowSteps from "./FlowSteps";

/** Đầu trang của luồng kết nối: nút quay lại, thanh bước (tuỳ chọn), tiêu đề và mô tả. */
export function FlowHead({ back, step, title, lead, actions }: {
  back?: { href: string; label: string };
  step?: 0 | 1 | 2 | 3 | 4;
  title?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="fl-head">
      {back && <Link href={back.href} className="fl-back"><ArrowLeft aria-hidden="true" />{back.label}</Link>}
      {step !== undefined && <FlowSteps step={step} />}
      {title && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="fl-title">{title}</h1>
            {lead && <p className="fl-lead">{lead}</p>}
          </div>
          {actions}
        </div>
      )}
    </div>
  );
}

/** Ô vuông bo góc chứa ảnh hoặc chữ cái đầu của tên. */
export function FlowTile({ name, src, size, tone }: { name: string | null | undefined; src?: string | null; size?: "sm" | "lg"; tone?: "1" | "2" | "muted" }) {
  return (
    <span className="fl-tile" data-size={size} data-tone={tone} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh đại diện từ API (URL động) */}
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}

export function FlowPill({ tone, children }: { tone?: "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return <span className="fl-pill" data-tone={tone}>{children}</span>;
}

/** Nhóm chip chọn một giá trị (radiogroup, mũi tên chuyển lựa chọn). */
export function FlowChoice<T extends string | number>({ label, options, value, onChange, disabled }: {
  label: string;
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    const idx = enabled.findIndex((o) => o.id === value);
    const next = enabled[(idx + dir + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.id);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  }
  return (
    <div ref={ref} className="fl-choices" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={String(o.id)} type="button" role="radio" className="fl-chip" aria-checked={on} tabIndex={on ? 0 : -1}
            disabled={disabled || o.disabled} onClick={() => onChange(o.id)}>
            {on && <Check aria-hidden="true" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tiến trình thu gọn của một yêu cầu đã được chấp nhận: current = chỉ số bước đang làm (0–4). */
export function FlowMini({ current }: { current: number }) {
  const labels = ["Đã gửi", "Mentor chấp nhận", "Đặt lịch", "Thanh toán", "Hoàn tất"];
  return (
    <ol className="fl-mini" aria-label="Tiến trình">
      {labels.map((l, i) => (
        <li key={l} data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
          <i>{i < current ? <Check aria-hidden="true" /> : i + 1}</i>{l}
        </li>
      ))}
    </ol>
  );
}
