"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "mentorhub-theme";
const ThemeContext = createContext(null);

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
  else root.removeAttribute("data-theme");
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("auto");

  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    setMode(stored === "light" || stored === "dark" ? stored : "auto");
  }, []);

  const setThemeMode = useCallback((next) => {
    setMode(next);
    applyTheme(next);
    try {
      if (next === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  return <ThemeContext.Provider value={{ mode, setThemeMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
