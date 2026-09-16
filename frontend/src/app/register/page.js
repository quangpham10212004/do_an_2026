"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Alert } from "@/components/ui";

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "MENTEE",
    referralCode: params.get("ref") || "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await register({ ...form, referralCode: form.referralCode || null });
      const query = new URLSearchParams({ welcome: "1" });
      if (res.referralApplied === false) query.set("referral", "invalid");
      if (res.emailVerificationToken) query.set("verify", res.emailVerificationToken);
      router.push(`/dashboard?${query}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto" }}>
      <div className="card">
        <h1>Tạo tài khoản</h1>
        <Alert>{error}</Alert>
        <form onSubmit={submit}>
          <div className="field">
            <label>Bạn tham gia với vai trò</label>
            <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {[
                ["MENTEE", "Mentee", "Tôi muốn tìm mentor để học"],
                ["MENTOR", "Mentor", "Tôi muốn hướng dẫn người khác"],
              ].map(([value, title, desc]) => (
                <label key={value} className={`card ${form.role === value ? "highlight" : ""}`} style={{ cursor: "pointer", marginBottom: 0 }}>
                  <input type="radio" name="role" value={value} checked={form.role === value} onChange={set("role")} /> {title}
                  <div className="hint">{desc}</div>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="fullName">Họ và tên</label>
            <input id="fullName" value={form.fullName} onChange={set("fullName")} maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={set("email")} />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" type="password" required minLength={8} value={form.password} onChange={set("password")} />
            <div className="hint">Tối thiểu 8 ký tự.</div>
          </div>
          <div className="field">
            <label htmlFor="referralCode">Mã giới thiệu (nếu có)</label>
            <input id="referralCode" value={form.referralCode} onChange={set("referralCode")} maxLength={32} />
          </div>
          <button className="btn block" disabled={loading}>{loading ? "Đang tạo tài khoản..." : "Đăng ký"}</button>
        </form>
        <p className="muted small" style={{ marginTop: "1rem" }}>
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
