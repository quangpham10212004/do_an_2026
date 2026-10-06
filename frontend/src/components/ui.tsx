"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { STATUS_LABELS, statusTone } from "@/lib/format";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <span className={`badge ${statusTone(status)}`}>{STATUS_LABELS[status] || status}</span>;
}

export type AlertType = "error" | "success" | "info" | "warn";

/** Thông báo kết quả thao tác hiển thị đầu trang (thành công / thông tin / lỗi). */
export interface Flash {
  ok?: string;
  info?: string;
  error?: string;
}

export function Alert({ type = "error", children }: { type?: AlertType; children?: ReactNode }) {
  if (!children) return null;
  return <div className={`alert ${type}`}>{children}</div>;
}

export function Loading({ text = "Đang tải..." }: { text?: string }) {
  return <div className="empty">{text}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stars({ value }: { value: number | null | undefined }) {
  const v = Math.round(Number(value || 0));
  return <span className="stars" aria-label={`${value} sao`}>{"★".repeat(v)}{"☆".repeat(5 - v)}</span>;
}

export function ScoreRing({ value, max = 100 }: { value: number | null | undefined; max?: number }) {
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  return (
    <div className="score-ring" style={{ "--p": pct } as CSSProperties}>
      <span>{Number(value || 0).toFixed(max === 1 ? 2 : 0)}</span>
    </div>
  );
}

export function ProgressBar({ value }: { value: number | null | undefined }) {
  return (
    <div className="progress" aria-valuenow={value ?? 0}>
      <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function PageHead({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/**
 * Hộp thoại thay cho window.confirm / window.prompt, đồng bộ design system.
 * const [dialog, ask] = useDialog(); render {dialog}; rồi
 *   await ask({ title, message?, input?: { label, placeholder?, defaultValue? }, confirmText?, danger? })
 * trả về chuỗi đã nhập (có input), true (xác nhận không có input) hoặc null khi huỷ.
 */
export interface DialogOptions {
  title: string;
  message?: ReactNode;
  input?: { label: string; placeholder?: string; defaultValue?: string; maxLength?: number };
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** Kết quả hộp thoại: chuỗi đã nhập (có input), true (xác nhận không có input), null khi huỷ. */
export type DialogResult = string | true | null;
export type AskFn = {
  (options: DialogOptions & { input: NonNullable<DialogOptions["input"]> }): Promise<string | null>;
  (options: DialogOptions): Promise<DialogResult>;
};

type DialogState = DialogOptions & { resolve: (value: DialogResult) => void };

export function useDialog(): [ReactNode, AskFn] {
  const [state, setState] = useState<DialogState | null>(null);
  const ask = useCallback(
    (options: DialogOptions) => new Promise<DialogResult>((resolve) => setState({ ...options, resolve })),
    [],
  ) as AskFn;
  const close = useCallback((value: DialogResult) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);
  const dialog = state ? <Dialog key={state.title} options={state} onClose={close} /> : null;
  return [dialog, ask];
}

function Dialog({ options, onClose }: { options: DialogOptions; onClose: (value: DialogResult) => void }) {
  const { title, message, input, confirmText = "Xác nhận", cancelText = "Huỷ", danger } = options;
  const [value, setValue] = useState(input?.defaultValue ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (inputRef.current ?? confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onClose(input ? value : true);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={submit}>
        <h2 id="dialog-title">{title}</h2>
        {message && <p>{message}</p>}
        {input && (
          <div className="field">
            <label htmlFor="dialog-input">{input.label}</label>
            <textarea id="dialog-input" ref={inputRef} value={value} maxLength={input.maxLength ?? 1000}
              placeholder={input.placeholder} onChange={(e) => setValue(e.target.value)} />
          </div>
        )}
        <div className="row dialog-actions">
          <button type="button" className="btn secondary" onClick={() => onClose(null)}>{cancelText}</button>
          <button ref={confirmRef} className={`btn ${danger ? "danger" : ""}`}>{confirmText}</button>
        </div>
      </form>
    </div>
  );
}
