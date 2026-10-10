"use client";

import NotificationPreferencesCard from "@/features/auth/NotificationPreferencesCard";
import { useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, FlashAlerts, Input, Loading, PageHeader, StatusBadge, type Flash } from "@/components/ui";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, formatDate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { User } from "@/types";

function Account() {
  const { updateUser } = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState<Flash>({});

  useEffect(() => {
    authApi.me().then((u) => {
      setMe(u);
      setFullName(u.fullName || "");
    }).catch((err) => setMsg({ error: errorMessage(err) }));
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    try {
      const u = await authApi.updateMe(fullName);
      setMe(u);
      updateUser({ fullName: u.fullName });
      setMsg({ ok: "Đã cập nhật họ và tên." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await authApi.changePassword(pw.currentPassword, pw.newPassword);
      setPw({ currentPassword: "", newPassword: "" });
      setMsg({ ok: "Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  if (!me) return msg.error ? <Alert>{msg.error}</Alert> : <Loading />;
  return (
    <div className="max-w-[860px]">
      <PageHeader
        title="Tài khoản và bảo mật"
        description={`${me.email} · ${ROLE_LABELS[me.role]} · tham gia ${formatDate(me.createdAt)}`}
        actions={<>
          {me.emailVerified ? <Badge tone="success">Email đã xác thực</Badge> : <Badge tone="warning">Email chưa xác thực</Badge>}
          <StatusBadge status={me.status} />
        </>}
      />
      <FlashAlerts flash={msg} className="mb-6" />
      <div className="flex flex-col gap-6">
        <form onSubmit={saveName}>
          <Card>
            <CardHeader title="Thông tin cá nhân" />
            <CardBody>
              <Field label="Họ và tên" id="acc-name" required>
                <Input id="acc-name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="max-w-[420px]" />
              </Field>
            </CardBody>
            <CardFooter><Button type="submit" variant="primary">Lưu</Button></CardFooter>
          </Card>
        </form>
        <form onSubmit={changePassword}>
          <Card>
            <CardHeader title="Đổi mật khẩu" description="Sau khi đổi, các phiên đăng nhập trên thiết bị khác sẽ bị đăng xuất." />
            <CardBody>
              <div className="form-grid">
                <Field label="Mật khẩu hiện tại" id="acc-current">
                  <Input id="acc-current" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                </Field>
                <Field label="Mật khẩu mới" id="acc-new" hint="Tối thiểu 8 ký tự.">
                  <Input id="acc-new" type="password" autoComplete="new-password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                </Field>
              </div>
            </CardBody>
            <CardFooter><Button type="submit">Đổi mật khẩu</Button></CardFooter>
          </Card>
        </form>
        {me.role !== "ADMIN" && <NotificationPreferencesCard />}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}
