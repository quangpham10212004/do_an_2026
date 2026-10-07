"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui";
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
    <div style={{ maxWidth: 420, margin: "2rem auto" }}>
      <div className="card">
        <h1>Quên mật khẩu</h1>
        <Alert>{error}</Alert>
        {sent ? (
          <Alert type="success">
            Nếu email {email.trim()} đã đăng ký tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu. Liên kết có hiệu lực
            trong 30 phút và chỉ dùng được một lần. Hãy kiểm tra hộp thư (kể cả thư rác).
          </Alert>
        ) : (
          <form onSubmit={submit}>
            <p className="muted small">Nhập email đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới.</p>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn block" disabled={loading}>{loading ? "Đang gửi..." : "Gửi liên kết đặt lại"}</button>
          </form>
        )}
        <p className="muted small" style={{ marginTop: "1rem" }}>
          <Link href="/login">← Quay lại đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
