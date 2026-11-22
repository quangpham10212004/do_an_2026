"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Loading } from "@/components/ui";

/** Giữ route cũ: chuyển sang bố cục danh sách + chi tiết tại /admin/message-reports?id=. */
function Redirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin/message-reports?id=${encodeURIComponent(id)}`);
  }, [id, router]);
  return <Loading />;
}

export default function AdminMessageReportPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Redirect />}</RequireAuth>;
}
