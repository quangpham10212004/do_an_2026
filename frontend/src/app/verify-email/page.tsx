"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { Alert, Loading } from "@/components/ui";
import { errorMessage, loadSession, refreshSession } from "@/lib/api";
import type { User } from "@/types";

type VerifyState = { status: "loading" } | { status: "done"; user: User } | { status: "error"; error: string };

function Verify() {
  const token = useSearchParams().get("token");
  const { updateUser } = useAuth();
  const [state, setState] = useState<VerifyState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", error: "Thiếu mã xác thực" });
      return;
    }
    authApi
      .verifyEmail(token)
      .then(async (user) => {
        updateUser({ emailVerified: true });
        // US-39 — access token cũ mang ev=false: đổi token để gửi yêu cầu / đặt lịch / thanh toán được ngay.
        if (loadSession()?.refreshToken) await refreshSession().catch(() => false);
        setState({ status: "done", user });
      })
      .catch((e) => setState({ status: "error", error: errorMessage(e) }));
  }, [token, updateUser]);

  if (state.status === "loading") return <Loading text="Đang xác thực email..." />;
  return (
    <div className="card" style={{ maxWidth: 480, margin: "2rem auto" }}>
      <h1>Xác thực email</h1>
      {state.status === "error" ? <Alert>{state.error}</Alert> : <Alert type="success">Email {state.user.email} đã được xác thực.</Alert>}
      <Link href="/dashboard" className="btn">Về trang chủ</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
