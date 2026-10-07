"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui";
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
        <Alert>Thiếu mã đặt lại mật khẩu trong liên kết.</Alert>
        <Link href="/forgot-password" className="btn">Yêu cầu liên kết mới</Link>
      </>
    );
  }
  if (done) {
    return (
      <>
        <Alert type="success">Đã đặt mật khẩu mới. Mọi phiên đăng nhập cũ đã bị đăng xuất.</Alert>
        <Link href="/login" className="btn">Đăng nhập</Link>
      </>
    );
  }
  return (
    <form onSubmit={submit}>
      <Alert>{error}</Alert>
      <div className="field">
        <label htmlFor="password">Mật khẩu mới</label>
        <input id="password" type="password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="hint">8-72 ký tự.</div>
      </div>
      <div className="field">
        <label htmlFor="confirm">Nhập lại mật khẩu mới</label>
        <input id="confirm" type="password" required maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button className="btn block" disabled={loading}>{loading ? "Đang lưu..." : "Đặt mật khẩu mới"}</button>
      {error && <p className="small" style={{ marginTop: "0.75rem" }}><Link href="/forgot-password">Yêu cầu liên kết mới</Link></p>}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{ maxWidth: 420, margin: "2rem auto" }}>
      <div className="card">
        <h1>Đặt lại mật khẩu</h1>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
