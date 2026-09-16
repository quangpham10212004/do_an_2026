"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS_LABELS, statusTone } from "@/lib/format";

export function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`badge ${statusTone(status)}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Alert({ type = "error", children }) {
  if (!children) return null;
  return <div className={`alert ${type}`}>{children}</div>;
}

export function Loading({ text = "Đang tải..." }) {
  return <div className="empty">{text}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Stars({ value }) {
  const v = Math.round(Number(value || 0));
  return <span className="stars" aria-label={`${value} sao`}>{"★".repeat(v)}{"☆".repeat(5 - v)}</span>;
}

export function ScoreRing({ value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  return (
    <div className="score-ring" style={{ "--p": pct }}>
      <span>{Number(value || 0).toFixed(max === 1 ? 2 : 0)}</span>
    </div>
  );
}

export function ProgressBar({ value }) {
  return (
    <div className="progress" aria-valuenow={value}>
      <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function PageHead({ title, subtitle, children }) {
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
export function useDialog() {
  const [state, setState] = useState(null);
  const ask = useCallback((options) => new Promise((resolve) => setState({ ...options, resolve })), []);
  const close = useCallback((value) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);
  const dialog = state ? <Dialog key={state.title} options={state} onClose={close} /> : null;
  return [dialog, ask];
}

function Dialog({ options, onClose }) {
  const { title, message, input, confirmText = "Xác nhận", cancelText = "Huỷ", danger } = options;
  const [value, setValue] = useState(input?.defaultValue ?? "");
  const focusRef = useRef(null);

  useEffect(() => {
    focusRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e) {
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
            <textarea id="dialog-input" ref={focusRef} value={value} maxLength={input.maxLength ?? 1000}
              placeholder={input.placeholder} onChange={(e) => setValue(e.target.value)} />
          </div>
        )}
        <div className="row dialog-actions">
          <button type="button" className="btn secondary" onClick={() => onClose(null)}>{cancelText}</button>
          <button ref={input ? undefined : focusRef} className={`btn ${danger ? "danger" : ""}`}>{confirmText}</button>
        </div>
      </form>
    </div>
  );
}
