"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { Alert, ButtonLink, Loading } from "@/components/ui";
import AuthCard from "@/components/shell/AuthCard";
import { errorMessage, loadSession, refreshSession } from "@/lib/api";
import type { User } from "@/types";

type VerifyState = { status: "loading" } | { status: "done"; user: User } | { status: "error"; error: string };

function Verify() {
  const token = useSearchParams().get("token");
  const { user, updateUser } = useAuth();
  const [state, setState] = useState<VerifyState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", error: "Liên kết thiếu mã xác thực. Mở lại liên kết trong email." });
      return;
    }
    authApi
      .verifyEmail(token)
      .then(async (verified) => {
        updateUser({ emailVerified: true });
        // US-39 — access token cũ mang ev=false: đổi token để gửi yêu cầu / đặt lịch / thanh toán được ngay.
        if (loadSession()?.refreshToken) await refreshSession().catch(() => false);
        setState({ status: "done", user: verified });
      })
      .catch((e) => setState({ status: "error", error: errorMessage(e) }));
  }, [token, updateUser]);

  return (
    <AuthCard title="Xác thực email">
      {state.status === "loading" ? (
        <Loading text="Đang xác thực email…" />
      ) : state.status === "error" ? (
        <Alert>{state.error}</Alert>
      ) : (
        <Alert tone="success">Email {state.user.email} đã được xác thực.</Alert>
      )}
      {state.status !== "loading" && (
        <ButtonLink href={user ? "/dashboard" : "/login"} variant="primary" block>{user ? "Về trang tổng quan" : "Đăng nhập"}</ButtonLink>
      )}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
