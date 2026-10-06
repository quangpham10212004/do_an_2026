"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { Role, SessionUser } from "@/types";
import { Loading } from "./ui";

/** Bảo vệ trang: yêu cầu đăng nhập và (tuỳ chọn) đúng vai trò. */
interface RequireAuthProps {
  roles?: Role[];
  /** Nội dung trang, hoặc hàm nhận người dùng đã đăng nhập (chắc chắn khác null). */
  children: ReactNode | ((user: SessionUser) => ReactNode);
}

export default function RequireAuth({ roles, children }: RequireAuthProps) {
  const { ready, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return <Loading />;
  if (roles && !roles.includes(user.role)) {
    return <div className="alert error">Trang này không dành cho vai trò của bạn.</div>;
  }
  return typeof children === "function" ? children(user) : children;
}
