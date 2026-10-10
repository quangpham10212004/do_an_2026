"use client";

import Link from "next/link";
import { Suspense, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Presentation } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { RegisterInput, Role } from "@/types";
import { Alert, Button, Field, Input } from "@/components/ui";
import AuthCard from "@/components/shell/AuthCard";
import { errorMessage } from "@/lib/api";

const ROLES: { value: Exclude<Role, "ADMIN">; title: string; desc: string; icon: typeof GraduationCap }[] = [
  { value: "MENTEE", title: "Mentee", desc: "Tôi muốn tìm mentor để học", icon: GraduationCap },
  { value: "MENTOR", title: "Mentor", desc: "Tôi muốn hướng dẫn người khác", icon: Presentation },
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
  const [loading, setLoading] = useState(false);
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
      router.push(`${form.role === "MENTEE" ? "/onboarding" : "/dashboard"}?${query}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Tạo tài khoản"
      description="Miễn phí. Bạn có thể đổi thông tin hồ sơ bất cứ lúc nào."
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
        <Field label="Mã giới thiệu" id="referralCode" hint="Không bắt buộc. Nhập nếu bạn được bạn bè mời.">
          <Input id="referralCode" value={form.referralCode} onChange={set("referralCode")} maxLength={32} className="font-mono" />
        </Field>
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
