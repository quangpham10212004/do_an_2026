"use client";

import RequireAuth from "@/components/RequireAuth";
import { PageHeader } from "@/components/ui";
import AddDomainFlow from "@/features/domains/AddDomainFlow";

export default function AddDomainPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      {(user) => (
        <>
          <PageHeader back={{ href: "/profile/domains", label: "Lưu và thoát" }} title="Thêm lĩnh vực mới" />
          <AddDomainFlow mentorId={user.userId} />
        </>
      )}
    </RequireAuth>
  );
}
