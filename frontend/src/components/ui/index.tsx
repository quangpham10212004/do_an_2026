"use client";

/*
 * MentorHub UI — React components của design system (frontend/design-system, đồng bộ với Claude Design).
 * Mỗi component chỉ gắn lớp CSS trong src/styles/components.css; bố cục trang dùng tiện ích Tailwind.
 */
import Link from "next/link";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Star, XCircle, type LucideIcon } from "lucide-react";
import { STATUS_LABELS, statusTone, type StatusTone } from "@/lib/format";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------- Button ---------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-quiet";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Nút chỉ có biểu tượng: `children` bỏ trống, `label` đọc bởi trình đọc màn hình. */
  iconOnly?: boolean;
  block?: boolean;
}

function buttonClass({ variant = "secondary", size = "md", iconOnly, block }: ButtonStyleProps, extra?: string) {
  return cx(
    "btn",
    variant === "primary" && "btn-primary",
    variant === "ghost" && "btn-ghost",
    variant === "danger" && "btn-danger",
    variant === "danger-quiet" && "btn-danger-quiet",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    iconOnly && "btn-icon",
    block && "btn-block",
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  loading?: boolean;
  label?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon: Icon, iconOnly, block, loading, label, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, iconOnly, block }, className)}
      disabled={disabled || loading}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : rest.title}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon && <Icon aria-hidden="true" />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant, size, icon: Icon, iconOnly, block, className, children, label, ...rest }:
  ButtonStyleProps & { href: string; className?: string; children?: ReactNode; label?: string; target?: string; rel?: string }) {
  return (
    <Link href={href} className={buttonClass({ variant, size, iconOnly, block }, className)} aria-label={iconOnly ? label : undefined} {...rest}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </Link>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/* ---------- Card ---------- */

export function Card({ children, className, as = "section", style }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; style?: CSSProperties }) {
  const Tag = as;
  return <Tag className={cx("card", className)} style={style}>{children}</Tag>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="card-head">
      <div className="min-w-0">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("card-body", className)}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <footer className="card-foot">{children}</footer>;
}

/* ---------- Form ---------- */

export function Field({ label, hint, error, required, id, children, className }: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** id của control bên trong (gắn cho <label htmlFor>). */
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("field", className)} data-invalid={error ? "" : undefined}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? <div className="field-error">{error}</div> : hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx("input", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx("select", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx("textarea", className)} {...rest} />;
});

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx("check", className)}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Radio({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx("check", className)}>
      <input type="radio" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/* ---------- Badge, chip ---------- */

export type BadgeTone = StatusTone | "accent";

export function Badge({ tone = "neutral", plain, children, title }: { tone?: BadgeTone; plain?: boolean; children: ReactNode; title?: string }) {
  return <span className={cx("badge", tone !== "neutral" && `badge-${tone}`, plain && "badge-plain")} title={title}>{children}</span>;
}

/** Badge trạng thái chung: nhãn từ `labels` (mặc định STATUS_LABELS), sắc thái từ `tone` (mặc định statusTone). */
export function StatusBadge({ status, labels = STATUS_LABELS, tone = statusTone }: {
  status: string | null | undefined;
  labels?: Record<string, string>;
  tone?: (status: string) => StatusTone;
}) {
  if (!status) return null;
  return <Badge tone={tone(status)}>{labels[status] || STATUS_LABELS[status] || status}</Badge>;
}

export function Count({ value }: { value: number }) {
  if (!value) return null;
  return <span className="count">{value > 99 ? "99+" : value}</span>;
}

export function Chip({ children, selected, match, onClick, title }: { children: ReactNode; selected?: boolean; match?: boolean; onClick?: () => void; title?: string }) {
  if (onClick) {
    return (
      <button type="button" className={cx("chip", match && "chip-match")} aria-pressed={!!selected} onClick={onClick} title={title}>
        {children}
      </button>
    );
  }
  return <span className={cx("chip", selected && "chip-selected", match && "chip-match")} title={title}>{children}</span>;
}

export function Chips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("chips", className)}>{children}</div>;
}

/* ---------- Alert ---------- */

export type AlertTone = "info" | "success" | "warning" | "danger";
const ALERT_ICON: Record<AlertTone, LucideIcon> = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({ tone = "danger", title, children, action, className }: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  if (!children && !title) return null;
  const Icon = ALERT_ICON[tone];
  return (
    <div className={cx("alert", tone !== "info" && `alert-${tone}`, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** Thông báo kết quả thao tác (thành công / thông tin / lỗi). */
export interface Flash {
  ok?: string;
  info?: string;
  error?: string;
}

export function FlashAlerts({ flash, className }: { flash: Flash; className?: string }) {
  if (!flash.ok && !flash.info && !flash.error) return null;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <Alert tone="success">{flash.ok}</Alert>
      <Alert tone="info">{flash.info}</Alert>
      <Alert tone="danger">{flash.error}</Alert>
    </div>
  );
}

/* ---------- Tabs ---------- */

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div className={cx("tabs", className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="text-ink-subtle tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Table, list, description list ---------- */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="table-wrap">
      <table className={cx("table", className)}>{children}</table>
    </div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

export function ListRow({ title, meta, leading, trailing, href, unread, children }: {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  unread?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      {leading}
      <div className="list-row-main">
        <div className="list-row-title">{title}</div>
        {meta && <div className="list-row-meta">{meta}</div>}
        {children}
      </div>
      {trailing && <div className="flex flex-wrap items-center justify-end gap-2">{trailing}</div>}
    </>
  );
  const className = cx("list-row", unread && "list-row-unread");
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

export function DescriptionList({ items }: { items: [label: ReactNode, value: ReactNode][] }) {
  return (
    <dl className="dl">
      {items.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Stat ---------- */

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="card stats">{children}</div>;
}

/* ---------- Avatar ---------- */

export function initials(name: string | null | undefined): string {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts.length > 1 ? parts[parts.length - 2][0] : "") + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, src, size = "md" }: { name: string | null | undefined; src?: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <span className={cx("avatar", size !== "md" && `avatar-${size}`)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh đại diện từ API (URL động, không qua next/image) */}
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}

/* ---------- Empty, loading ---------- */

export function EmptyState({ icon: Icon = Inbox, title, children, action }: { icon?: LucideIcon; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon aria-hidden="true" />
      {title && <div className="empty-title">{title}</div>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ text = "Đang tải…" }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <Spinner />
      {text}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cx("skeleton", className)} style={style} />;
}

/* ---------- Progress, score, stars ---------- */

export function Progress({ value, label }: { value: number | null | undefined; label?: string }) {
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function ScoreRing({ value, max = 100, size = "md", label }: { value: number | null | undefined; max?: number; size?: "md" | "lg"; label?: string }) {
  const n = Number(value || 0);
  const pct = Math.max(0, Math.min(100, (n / max) * 100));
  return (
    <div className={cx("score", size === "lg" && "score-lg")} style={{ "--p": pct } as CSSProperties} aria-label={label}>
      <span>{n.toFixed(max === 1 ? 2 : 0)}</span>
    </div>
  );
}

export function Stars({ value, count }: { value: number | null | undefined; count?: number }) {
  const v = Math.round(Number(value || 0));
  return (
    <span className="stars" aria-label={`${Number(value || 0).toFixed(1)} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i > v ? "off" : undefined} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      ))}
      {count != null && <span className="ml-1 text-small text-ink-muted tabular">({count})</span>}
    </span>
  );
}

/* ---------- Page header ---------- */

export function PageHeader({ title, description, back, actions }: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="page-header-back">
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {description && <p className="page-header-desc">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {actions}
    </div>
  );
}

/* ---------- Dialog ---------- */

/**
 * Hộp thoại thay cho window.confirm / window.prompt.
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
  const dialog = state ? <ConfirmDialog key={state.title} options={state} onClose={close} /> : null;
  return [dialog, ask];
}

function ConfirmDialog({ options, onClose }: { options: DialogOptions; onClose: (value: DialogResult) => void }) {
  const { title, message, input, confirmText = "Xác nhận", cancelText = "Huỷ", danger } = options;
  const [value, setValue] = useState(input?.defaultValue ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();

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
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`} onSubmit={submit}>
        <div className="dialog-body">
          <h2 id={`${inputId}-title`} className="dialog-title">{title}</h2>
          {message && <div className="text-ink-muted">{message}</div>}
          {input && (
            <Field label={input.label} id={inputId}>
              <Textarea id={inputId} ref={inputRef} value={value} maxLength={input.maxLength ?? 1000}
                placeholder={input.placeholder} onChange={(e) => setValue(e.target.value)} />
            </Field>
          )}
        </div>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => onClose(null)}>{cancelText}</Button>
          <Button ref={confirmRef} type="submit" variant={danger ? "danger" : "primary"}>{confirmText}</Button>
        </div>
      </form>
    </div>
  );
}

/** Hộp thoại tuỳ biến (form riêng bên trong). Đóng bằng Esc hoặc bấm ra ngoài. */
export function Modal({ title, onClose, children, footer, width }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="dialog-body">
          <h2 id={titleId} className="dialog-title">{title}</h2>
          {children}
        </div>
        {footer && <div className="dialog-actions">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Pagination ---------- */

/** Phân trang 0-based; ẩn khi chỉ có một trang. */
export function Pagination({ page, totalPages, onChange, summary }: { page: number; totalPages: number; onChange: (page: number) => void; summary?: ReactNode }) {
  if (totalPages <= 1 && !summary) return null;
  return (
    <nav className="pagination" aria-label="Phân trang">
      <span>{summary ?? `Trang ${page + 1} / ${totalPages}`}</span>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <Button size="sm" icon={ChevronLeft} disabled={page <= 0} onClick={() => onChange(page - 1)}>Trước</Button>
          <Button size="sm" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>
            Sau
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
