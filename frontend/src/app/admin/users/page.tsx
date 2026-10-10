"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Search } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Loading, PageHeader, Pagination, Select, StatusBadge, Table } from "@/components/ui";
import { authApi, type UserFilters } from "@/features/auth/api";
import { ROLE_LABELS, formatDate } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { PageResponse, Role, User } from "@/types";

function Users() {
  const [filters, setFilters] = useState<Required<UserFilters>>({ role: "", q: "", page: 0 });
  const [data, setData] = useState<PageResponse<User> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () => authApi.adminListUsers(filters).then((d) => { setData(d); setError(""); }).catch((e: unknown) => setError(errorMessage(e))),
    [filters],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(u: User) {
    setError("");
    try {
      await authApi.adminSetStatus(u.id, u.status === "ACTIVE" ? "LOCKED" : "ACTIVE");
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Tài khoản" description="Xem, khoá hoặc mở khoá tài khoản người dùng." />
      <Alert className="mb-6">{error}</Alert>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label="Vai trò" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value as Role | "", page: 0 })} className="w-auto min-w-[160px]">
          <option value="">Mọi vai trò</option>
          <option value="MENTEE">Mentee</option>
          <option value="MENTOR">Mentor</option>
          <option value="ADMIN">Quản trị viên</option>
        </Select>
        <div className="relative w-full max-w-[320px]">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input type="search" aria-label="Tìm người dùng" placeholder="Tìm theo email hoặc tên" value={filters.q} className="pl-9"
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 0 })} />
        </div>
      </div>
      {!data ? (error ? null : <Loading />) : (
        <Card>
          <Table>
            <thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th>Email</th><th>Ngày tạo</th><th></th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="max-w-[260px] truncate">{u.email}</td>
                  <td>{u.fullName || "—"}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{u.emailVerified ? <Badge tone="success" plain>Đã xác thực</Badge> : <span className="text-ink-subtle">Chưa</span>}</td>
                  <td className="whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="actions">
                    <div className="flex justify-end gap-1">
                      <Link className="btn btn-sm btn-ghost" href={`/admin/audit?targetType=USER&targetId=${u.id}`}>Nhật ký</Link>
                      {u.role !== "ADMIN" && (
                        <Button size="sm" variant={u.status === "ACTIVE" ? "danger-quiet" : "secondary"} onClick={() => toggle(u)}>{u.status === "ACTIVE" ? "Khoá" : "Mở khoá"}</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} summary={`${data.totalItems} người dùng · trang ${data.page + 1}/${Math.max(data.totalPages, 1)}`}
            onChange={(p) => setFilters({ ...filters, page: p })} />
        </Card>
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
