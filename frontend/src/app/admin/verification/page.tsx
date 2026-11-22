"use client";

import RequireAuth from "@/components/RequireAuth";
import AdminQueue from "@/features/verification/AdminQueue";

export default function AdminVerificationPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminQueue />
    </RequireAuth>
  );
}
