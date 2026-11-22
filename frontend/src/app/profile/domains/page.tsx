"use client";

import RequireAuth from "@/components/RequireAuth";
import { ButtonLink, PageHeader } from "@/components/ui";
import { Plus } from "lucide-react";
import DomainManager from "@/features/domains/DomainManager";

export default function MentorDomainsPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      {(user) => (
        <>
          <PageHeader
            back={{ href: "/profile", label: "Quản lý hồ sơ" }}
            title="Lĩnh vực chuyên môn"
            description="Bạn có thể là mentor của nhiều lĩnh vực, ví dụ Software Engineering và Data. Mỗi lĩnh vực được xác thực riêng."
            actions={<ButtonLink href="/profile/domains/add" variant="primary" icon={Plus}>Thêm lĩnh vực</ButtonLink>}
          />
          <DomainManager mentorId={user.userId} />
        </>
      )}
    </RequireAuth>
  );
}
