"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
import { THEME_KEY as KEY } from "./theme-boot";

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** Theme người dùng chọn: sáng, tối, hoặc theo hệ điều hành (mặc định). Lưu trong localStorage của trình duyệt. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setChoice(saved);
    } catch {
      /* chế độ riêng tư */
    }
  }, []);
  const update = useCallback((next: ThemeChoice) => {
    setChoice(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* chế độ riêng tư: chỉ áp dụng cho phiên này */
    }
  }, []);
  return [choice, update];
}
