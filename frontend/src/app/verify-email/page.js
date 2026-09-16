"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { Alert, Loading } from "@/components/ui";

function Verify() {
  const token = useSearchParams().get("token");
  const { updateUser } = useAuth();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!token) {
      setState({ error: "Thiếu mã xác thực" });
      return;
    }
    authApi
      .verifyEmail(token)
      .then((user) => {
        updateUser({ emailVerified: true });
        setState({ user });
      })
      .catch((e) => setState({ error: e.message }));
  }, [token, updateUser]);

  if (state.loading) return <Loading text="Đang xác thực email..." />;
  return (
    <div className="card" style={{ maxWidth: 480, margin: "2rem auto" }}>
      <h1>Xác thực email</h1>
      {state.error ? <Alert>{state.error}</Alert> : <Alert type="success">Email {state.user.email} đã được xác thực.</Alert>}
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
