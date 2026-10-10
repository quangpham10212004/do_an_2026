"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { homePathFor, useAuth } from "@/lib/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import AuthCard from "@/components/shell/AuthCard";
import { errorMessage } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(email, password);
      router.push(homePathFor(res.role));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Đăng nhập"
      description="Tiếp tục với mentor, phiên học và lộ trình của bạn."
      footer={<>Chưa có tài khoản? <Link href="/register">Tạo tài khoản</Link></>}
    >
      <Alert>{error}</Alert>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" id="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu" id="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 text-right text-small"><Link href="/forgot-password">Quên mật khẩu?</Link></div>
        <Button type="submit" variant="primary" size="lg" block loading={loading}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}</Button>
      </form>
    </AuthCard>
  );
}
