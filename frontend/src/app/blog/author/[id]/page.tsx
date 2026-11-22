"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { blogApi } from "@/features/learning/blogApi";
import { Loading } from "@/components/ui";

/** Trang tác giả đã gộp vào trang cá nhân: chuyển tới hồ sơ mentor hoặc mentee tương ứng. */
export default function AuthorRedirect({ params }: { params: { id: string } }) {
  const router = useRouter();
  useEffect(() => {
    blogApi.author(params.id)
      .then((a) => router.replace(a.authorRole === "MENTOR" ? `/mentors/${params.id}` : `/mentees/${params.id}`))
      .catch(() => router.replace("/blog"));
  }, [params.id, router]);
  return <Loading />;
}
