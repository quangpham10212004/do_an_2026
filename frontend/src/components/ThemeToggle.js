"use client";

import { useTheme } from "@/lib/theme";

const MODES = ["light", "dark", "auto"];
const LABELS = { light: "Sáng", dark: "Tối", auto: "Tự động" };

function Icon({ mode }) {
  if (mode === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** Nút 3 trạng thái: sáng / tối / tự động (theo hệ điều hành). Click để chuyển vòng. */
export default function ThemeToggle() {
  const { mode, setThemeMode } = useTheme();

  function cycle() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setThemeMode(next);
  }

  return (
    <button type="button" className="bell" title={`Giao diện: ${LABELS[mode]} (bấm để đổi)`} aria-label={`Giao diện hiện tại: ${LABELS[mode]}. Bấm để đổi.`} onClick={cycle}>
      <Icon mode={mode} />
    </button>
  );
}
