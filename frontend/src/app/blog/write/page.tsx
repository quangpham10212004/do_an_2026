"use client";

import RequireAuth from "@/components/RequireAuth";
import BlogEditor from "@/features/learning/BlogEditor";

export default function WriteBlogPage() {
  return (
    <RequireAuth roles={["MENTOR", "MENTEE", "ADMIN"]}>
      <BlogEditor />
    </RequireAuth>
  );
}
