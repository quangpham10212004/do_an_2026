"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

const MOBILE = "(max-width: 900px)";

/**
 * Bảng lọc: trên máy tính là khối nằm ngang hàng nội dung; dưới 900px là ngăn kéo từ dưới lên
 * (có nền mờ, khoá cuộn trang, Esc hoặc bấm nền để đóng).
 * `always`: trên máy tính luôn hiện (cột lọc bên trái); trên điện thoại chỉ hiện khi `open`.
 */
export default function FilterSheet({ open, onClose, onClear, title = "Bộ lọc", always = false, className, children }: {
  open: boolean;
  onClose: () => void;
  onClear?: () => void;
  title?: string;
  always?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || !window.matchMedia(MOBILE).matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div className="fsheet-backdrop" data-open={open} onClick={onClose} />
      <section ref={ref} tabIndex={-1} className={`fsheet${className ? ` ${className}` : ""}`} data-open={open} data-always={always} role="group" aria-label={title}>
        <div className="fsheet-grip" aria-hidden="true" />
        <div className="fsheet-head">
          <b>{title}</b>
          <span className="flex items-center gap-1">
            {onClear && <button type="button" className="pop-link" onClick={onClear}>Xoá tất cả</button>}
            <button type="button" className="icon-btn fsheet-close" aria-label="Đóng bộ lọc" onClick={onClose}><X aria-hidden="true" /></button>
          </span>
        </div>
        <div className="fsheet-body">{children}</div>
      </section>
    </>
  );
}
