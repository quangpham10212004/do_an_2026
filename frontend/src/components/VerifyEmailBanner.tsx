"use client";

import Link from "next/link";
import { useState } from "react";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api";

/**
 * US-39 (PRD-AUTH-3) — tài khoản chưa xác thực email đăng nhập được nhưng không gửi yêu cầu, đặt lịch, thanh toán.
 * Banner nhắc xác thực + nút "Gửi lại email" (tối đa 3 lần / giờ).
 */
export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<{ ok?: string; error?: string; token?: string | null }>({});
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified || user.role === "ADMIN") return null;
  return (
    <div className="alert warn" style={{ margin: "0 0 var(--spacing-16)" }}>
      <strong>Email chưa xác thực.</strong> Bạn cần xác thực email trước khi gửi yêu cầu mentoring, đặt lịch hay thanh toán.{" "}
      <button className="btn secondary sm" disabled={busy} onClick={async () => {
        setBusy(true);
        setState({});
        try {
          const res = await authApi.resendVerification();
          setState({ ok: `Đã gửi lại email xác thực tới ${user.email}.`, token: res.emailVerificationToken });
        } catch (e) {
          setState({ error: errorMessage(e) });
        } finally {
          setBusy(false);
        }
      }}>Gửi lại email</button>
      {state.ok && <div className="small" style={{ marginTop: 6 }}>{state.ok}
        {state.token && <> (môi trường demo: <Link href={`/verify-email?token=${state.token}`}>xác thực ngay</Link>)</>}</div>}
      {state.error && <div className="small" style={{ marginTop: 6 }}>{state.error}</div>}
    </div>
  );
}
