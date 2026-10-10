"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, ButtonLink, Field, Input } from "@/components/ui";
import AuthCard from "@/components/shell/AuthCard";
import { authApi } from "@/features/auth/api";
import { ApiError, errorMessage } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8 || password.length > 72) {
      setError("Mật khẩu mới phải có 8-72 ký tự");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "RESET_TOKEN_INVALID"
        ? "Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng. Vui lòng yêu cầu liên kết mới."
        : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <Alert>Liên kết thiếu mã đặt lại mật khẩu. Mở lại liên kết trong email hoặc yêu cầu liên kết mới.</Alert>
        <ButtonLink href="/forgot-password" variant="primary" block>Yêu cầu liên kết mới</ButtonLink>
      </>
    );
  }
  if (done) {
    return (
      <>
        <Alert tone="success">Đã đặt mật khẩu mới. Mọi phiên đăng nhập cũ đã bị đăng xuất.</Alert>
        <ButtonLink href="/login" variant="primary" block>Đăng nhập</ButtonLink>
      </>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Alert action={error ? <Link href="/forgot-password" className="whitespace-nowrap text-small">Liên kết mới</Link> : undefined}>{error}</Alert>
      <Field label="Mật khẩu mới" id="password" hint="8-72 ký tự.">
        <Input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Nhập lại mật khẩu mới" id="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" required maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" block loading={loading}>{loading ? "Đang lưu…" : "Đặt mật khẩu mới"}</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Đặt lại mật khẩu" footer={<Link href="/login">Quay lại đăng nhập</Link>}>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
