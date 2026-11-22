"use client";

import RequireAuth from "@/components/RequireAuth";
import MentorEdit from "@/features/profile/MentorEdit";
import MenteeEdit from "@/features/profile/MenteeEdit";

/** Quản lý hồ sơ: bảng mục bên trái, thẻ mục có icon, thanh lưu cố định. Logic nằm trong features/profile. */
export default function ProfilePage() {
  return (
    <RequireAuth roles={["MENTOR", "MENTEE"]}>
      {(user) => (user.role === "MENTOR" ? <MentorEdit user={user} /> : <MenteeEdit user={user} />)}
    </RequireAuth>
  );
}
