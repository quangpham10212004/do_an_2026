"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
import { THEME_KEY as KEY } from "./theme-boot";

/** Báo cho mọi nơi dùng useTheme (nút ở thanh trên, menu tài khoản) khi theme đổi. */
const EVENT = "mmp-theme-change";

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "dark" || saved === "system" ? saved : "light";
  } catch {
    return "light"; // chế độ riêng tư
  }
}

/** Theme đang hiển thị thực tế (giải "system" theo hệ điều hành). */
export function resolvedTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Theme người dùng chọn: sáng (mặc định), tối, hoặc theo hệ điều hành. Lưu trong localStorage của trình duyệt. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("light");
  useEffect(() => {
    setChoice(read());
    const sync = () => setChoice(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const update = useCallback((next: ThemeChoice) => {
    setChoice(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* chế độ riêng tư: chỉ áp dụng cho phiên này */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [choice, update];
}
