"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import TimeZoneScope from "@/components/TimeZoneScope";
import AppShell from "./AppShell";
import PublicShell from "./PublicShell";

/** Chọn khung theo trạng thái đăng nhập: chưa đăng nhập → trang công khai; đã đăng nhập → sidebar + thanh trên. */
export default function Chrome({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  if (!ready) return <div className="min-h-screen bg-bg" />;
  if (!user) return <PublicShell>{children}</PublicShell>;
  return (
    <AppShell user={user}>
      <TimeZoneScope>{children}</TimeZoneScope>
    </AppShell>
  );
}
