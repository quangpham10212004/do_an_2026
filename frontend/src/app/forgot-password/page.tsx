"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import AuthCard from "@/components/shell/AuthCard";
import { authApi } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      description={sent ? undefined : "Nhập email đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới."}
      footer={<Link href="/login">Quay lại đăng nhập</Link>}
    >
      <Alert>{error}</Alert>
      {sent ? (
        <Alert tone="success" title="Đã gửi liên kết">
          Nếu email {email.trim()} đã đăng ký tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Liên kết có hiệu lực
          trong 30 phút và chỉ dùng được một lần. Kiểm tra cả hộp thư rác.
        </Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" id="email">
            <Input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={loading}>{loading ? "Đang gửi…" : "Gửi liên kết đặt lại"}</Button>
        </form>
      )}
    </AuthCard>
  );
}
