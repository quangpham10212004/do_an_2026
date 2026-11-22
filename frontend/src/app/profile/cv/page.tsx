"use client";

import RequireAuth from "@/components/RequireAuth";
import { PageHeader } from "@/components/ui";
import MyCvs from "@/features/ai/MyCvs";

/** /profile/cv: quản lý các bản CV đã tải lên. */
export default function ProfileCvPage() {
  return (
    <RequireAuth roles={["MENTEE", "MENTOR"]}>
      <PageHeader title="CV của tôi" back={{ href: "/profile", label: "Quản lý hồ sơ" }} description="Các bản CV bạn đã tải lên. AI dùng bản đang dùng để gợi ý và điền hồ sơ." />
      <MyCvs hideTitle />
    </RequireAuth>
  );
}
