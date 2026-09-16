"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { authApi } from "@/features/auth/api";
import { ROLE_LABELS, formatDate } from "@/lib/format";

function Users() {
  const [filters, setFilters] = useState({ role: "", q: "", page: 0 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => authApi.adminListUsers(filters).then(setData).catch((e) => setError(e.message)), [filters]);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(u) {
    setError("");
    try {
      await authApi.adminSetStatus(u.id, u.status === "ACTIVE" ? "LOCKED" : "ACTIVE");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <PageHead title="Quản lý người dùng" subtitle="Xem, khoá hoặc mở khoá tài khoản." />
      <Alert>{error}</Alert>
      <div className="row" style={{ marginBottom: "1rem" }}>
        <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 0 })} style={{ maxWidth: 180 }}>
          <option value="">Mọi vai trò</option>
          <option value="MENTEE">Mentee</option>
          <option value="MENTOR">Mentor</option>
          <option value="ADMIN">Admin</option>
        </select>
        <input placeholder="Tìm theo email hoặc tên" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 0 })} style={{ maxWidth: 320 }} />
      </div>
      {!data ? <Loading /> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th>Email xác thực</th><th>Ngày tạo</th><th></th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.fullName || "—"}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{u.emailVerified ? "✔" : "—"}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{u.role !== "ADMIN" && <button className={`btn sm ${u.status === "ACTIVE" ? "danger" : "good"}`} onClick={() => toggle(u)}>{u.status === "ACTIVE" ? "Khoá" : "Mở khoá"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row between" style={{ marginTop: "0.75rem" }}>
            <span className="muted small">{data.totalItems} người dùng</span>
            <div className="row">
              <button className="btn secondary sm" disabled={data.page === 0} onClick={() => setFilters({ ...filters, page: data.page - 1 })}>Trước</button>
              <span className="small">{data.page + 1}/{Math.max(data.totalPages, 1)}</span>
              <button className="btn secondary sm" disabled={data.page + 1 >= data.totalPages} onClick={() => setFilters({ ...filters, page: data.page + 1 })}>Sau</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Users />
    </RequireAuth>
  );
}
