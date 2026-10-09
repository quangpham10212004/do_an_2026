"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { DEFAULT_TIME_ZONE, setDisplayTimeZone } from "@/lib/format";

/**
 * US-37 (PRD-PROF-6) — tải múi giờ trong hồ sơ của người đăng nhập để mọi giờ hiển thị theo múi giờ đó, và vẽ lại trang
 * khi múi giờ đổi (sự kiện "mmp-timezone-changed"; chỉ xảy ra khi tải lần đầu khác giá trị đã lưu hoặc người dùng đổi).
 */
export default function TimeZoneScope({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("mmp-timezone-changed", bump);
    return () => window.removeEventListener("mmp-timezone-changed", bump);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === "ADMIN") {
      setDisplayTimeZone(DEFAULT_TIME_ZONE);
      return;
    }
    const path = user.role === "MENTOR" ? "mentor" : "mentee";
    api<{ timezone?: string }>(`/api/profile/${path}/${user.userId}`)
      .then((p) => setDisplayTimeZone(p.timezone))
      .catch(() => {});
  }, [user]);

  return <Fragment key={version}>{children}</Fragment>;
}
