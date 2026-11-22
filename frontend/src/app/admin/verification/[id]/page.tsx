"use client";

import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AdminDetail from "@/features/verification/AdminDetail";

export default function AdminVerificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminDetail id={id} />
    </RequireAuth>
  );
}
