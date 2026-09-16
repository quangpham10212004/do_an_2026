"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, PageHead, StatusBadge } from "@/components/ui";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, formatDate } from "@/lib/format";

function Account() {
  const { updateUser } = useAuth();
  const [me, setMe] = useState(null);
  const [fullName, setFullName] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState({});

  useEffect(() => {
    authApi.me().then((u) => {
      setMe(u);
      setFullName(u.fullName || "");
    });
  }, []);

  async function saveName(e) {
    e.preventDefault();
    try {
      const u = await authApi.updateMe(fullName);
      setMe(u);
      updateUser({ fullName: u.fullName });
      setMsg({ info: "Đã cập nhật thông tin" });
    } catch (err) {
      setMsg({ error: err.message });
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    try {
      await authApi.changePassword(pw.currentPassword, pw.newPassword);
      setPw({ currentPassword: "", newPassword: "" });
      setMsg({ info: "Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất." });
    } catch (err) {
      setMsg({ error: err.message });
    }
  }

  if (!me) return null;
  return (
    <>
      <PageHead title="Tài khoản" subtitle={`${me.email} · ${ROLE_LABELS[me.role]} · tham gia ${formatDate(me.createdAt)}`}>
        {me.emailVerified ? <span className="badge good">Email đã xác thực</span> : <span className="badge warn">Email chưa xác thực</span>}
        <StatusBadge status={me.status} />
      </PageHead>
      <Alert type="success">{msg.info}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="grid grid-2">
        <form className="card" onSubmit={saveName}>
          <h2>Thông tin cá nhân</h2>
          <div className="field">
            <label>Họ và tên</label>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <button className="btn">Lưu</button>
        </form>
        <form className="card" onSubmit={changePassword}>
          <h2>Đổi mật khẩu</h2>
          <div className="field">
            <label>Mật khẩu hiện tại</label>
            <input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </div>
          <div className="field">
            <label>Mật khẩu mới</label>
            <input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </div>
          <button className="btn">Đổi mật khẩu</button>
        </form>
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}
