"use client";

import RequireAuth from "@/components/RequireAuth";
import BlogEditor from "@/features/learning/BlogEditor";

export default function EditBlogPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["MENTOR", "MENTEE", "ADMIN"]}>
      <BlogEditor postId={params.id} />
    </RequireAuth>
  );
}
