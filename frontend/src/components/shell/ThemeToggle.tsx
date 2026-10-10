"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui";
import { resolvedTheme, useTheme } from "./theme";

/** Nút chuyển nhanh sáng ↔ tối ở thanh trên (lựa chọn "Theo hệ thống" vẫn có trong menu tài khoản). */
export default function ThemeToggle() {
  const [choice, setChoice] = useTheme();
  const dark = resolvedTheme(choice) === "dark";
  return (
    <Button variant="ghost" iconOnly icon={dark ? Sun : Moon} label={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      onClick={() => setChoice(dark ? "light" : "dark")} />
  );
}
