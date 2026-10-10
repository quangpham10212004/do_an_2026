"use client";

import Link from "next/link";
import { useState } from "react";
import { MailWarning } from "lucide-react";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import { Button } from "./ui";

/**
 * US-39 (PRD-AUTH-3) — tài khoản chưa xác thực email đăng nhập được nhưng không gửi yêu cầu, đặt lịch, thanh toán.
 * Dải nhắc xác thực dưới thanh trên + nút "Gửi lại email" (tối đa 3 lần / giờ).
 */
export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<{ ok?: string; error?: string; token?: string | null }>({});
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified || user.role === "ADMIN") return null;
  return (
    <div className="banner" role="status">
      <MailWarning aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>Email chưa xác thực.</strong> Xác thực email để gửi yêu cầu mentoring, đặt lịch và thanh toán.
        {state.ok && <> {state.ok}{state.token && <> Môi trường demo: <Link href={`/verify-email?token=${state.token}`}>xác thực ngay</Link>.</>}</>}
        {state.error && <span className="text-danger"> {state.error}</span>}
      </span>
      <Button size="sm" loading={busy} onClick={async () => {
        setBusy(true);
        setState({});
        try {
          const res = await authApi.resendVerification();
          setState({ ok: `Đã gửi lại email tới ${user.email}.`, token: res.emailVerificationToken });
        } catch (e) {
          setState({ error: errorMessage(e) });
        } finally {
          setBusy(false);
        }
      }}>Gửi lại email</Button>
    </div>
  );
}
