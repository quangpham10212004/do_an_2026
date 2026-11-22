"use client";

import Link from "next/link";
import { Suspense, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, MailCheck, Plus, Presentation } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { RegisterInput, Role } from "@/types";
import { Alert, Button, Checkbox, Field, Input } from "@/components/ui";
import AuthCard from "@/components/shell/AuthCard";
import { errorMessage } from "@/lib/api";
import { authApi } from "@/features/auth/api";

const ROLES: { value: Exclude<Role, "ADMIN">; title: string; desc: string; icon: typeof GraduationCap }[] = [
  { value: "MENTEE", title: "Tôi muốn học", desc: "Tìm mentor phù hợp bằng CV và mục tiêu", icon: GraduationCap },
  { value: "MENTOR", title: "Tôi muốn dạy", desc: "Trở thành mentor sau khi được xác thực", icon: Presentation },
];

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState<Required<Omit<RegisterInput, "referralCode">> & { referralCode: string }>({
    fullName: "",
    email: "",
    password: "",
    role: "MENTEE",
    referralCode: params.get("ref") || "",
  });
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showRef, setShowRef] = useState(!!params.get("ref"));
  const [loading, setLoading] = useState(false);
  // Sau khi đăng ký: màn "Kiểm tra email của bạn" (chưa chuyển trang ngay).
  const [sent, setSent] = useState<{ query: string; demoToken: string | null } | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await register({ ...form, referralCode: form.referralCode || null });
      const query = new URLSearchParams({ welcome: "1" });
      if (res.referralApplied === false) query.set("referral", "invalid");
      if (res.emailVerificationToken) query.set("verify", res.emailVerificationToken);
      setSent({ query: query.toString(), demoToken: res.emailVerificationToken ?? null });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    setResendMsg("");
    setError("");
    try {
      const r = await authApi.resendVerification();
      if (r.emailVerificationToken) setSent((cur) => (cur ? { ...cur, demoToken: r.emailVerificationToken } : cur));
      setResendMsg("Đã gửi lại email xác thực.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Kiểm tra email của bạn">
        <div className="flex flex-col items-start gap-4">
          <span className="ob-mail-ico"><MailCheck aria-hidden="true" /></span>
          <p className="text-ink-muted">
            Chúng tôi đã gửi liên kết xác thực tới <strong className="break-all text-ink">{form.email}</strong>.
            Bạn có thể bắt đầu làm hồ sơ ngay, xác thực sau cũng được.
          </p>
          <Alert className="w-full">{error}</Alert>
          <Alert tone="success" className="w-full">{resendMsg}</Alert>
          {sent.demoToken && (
            <Alert tone="info" className="w-full">Môi trường demo: <Link href={`/verify-email?token=${sent.demoToken}`}>Xác thực ngay</Link>.</Alert>
          )}
          <div className="flex w-full flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => router.push(`/onboarding/next?${sent.query}`)}>Tiếp tục làm hồ sơ</Button>
            <Button size="lg" loading={resending} onClick={resend}>Gửi lại email</Button>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Tạo tài khoản"
      description="Mentee làm hồ sơ bằng CV, mentor tải CV để được xác thực. Miễn phí."
      footer={<>Đã có tài khoản? <Link href="/login">Đăng nhập</Link></>}
    >
      <Alert>{error}</Alert>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1.5">Bạn tham gia với vai trò</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(({ value, title, desc, icon: Icon }) => {
              const checked = form.role === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 ${checked ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-surface-hover"}`}
                >
                  <input type="radio" name="role" value={value} checked={checked} onChange={set("role")} className="sr-only" />
                  <Icon aria-hidden="true" className={`size-5 ${checked ? "text-accent" : "text-ink-muted"}`} />
                  <span className="font-semibold">{title}</span>
                  <span className="text-small text-ink-muted">{desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="Họ và tên" id="fullName">
          <Input id="fullName" autoComplete="name" value={form.fullName} onChange={set("fullName")} maxLength={100} />
        </Field>
        <Field label="Email" id="email" required>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Mật khẩu" id="password" required hint="Tối thiểu 8 ký tự.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        {showRef ? (
          <Field label="Mã giới thiệu" id="referralCode" hint="Không bắt buộc. Nhập nếu bạn được bạn bè mời.">
            <Input id="referralCode" value={form.referralCode} onChange={set("referralCode")} maxLength={32} className="font-mono" />
          </Field>
        ) : (
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => setShowRef(true)}><Plus aria-hidden="true" />Tôi có mã giới thiệu</button>
          </div>
        )}
        <Checkbox
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          label={<>Tôi đồng ý với <Link href="/terms" target="_blank" className="font-semibold">Điều khoản sử dụng</Link> và <Link href="/privacy" target="_blank" className="font-semibold">Chính sách bảo mật</Link>.</>}
        />
        <Button type="submit" variant="primary" size="lg" block loading={loading}>{loading ? "Đang tạo tài khoản…" : "Tạo tài khoản"}</Button>
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
