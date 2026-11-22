"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";

/** Ảnh đại diện tác giả blog; tác giả chưa có ảnh thì lùi về chữ cái đầu thay vì ảnh vỡ. */
export default function AuthorAvatar({ userId, name, size = "md" }: { userId: string; name: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative inline-flex">
      <Avatar name={name} size={size} src={failed ? null : `/api/profile/avatars/${userId}`} />
      {!failed && (
        // Ảnh ẩn để bắt lỗi tải: <Avatar> không có onError
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/profile/avatars/${userId}`} alt="" className="hidden" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

/** Trang cá nhân của tác giả: mentor -> /mentors/{id}, còn lại -> /mentees/{id}. */
export function authorHref(userId: string, role?: string | null): string {
  return role === "MENTOR" ? `/mentors/${userId}` : `/mentees/${userId}`;
}
