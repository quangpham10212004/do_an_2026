"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { PracticeResultView, practiceTitle } from "@/features/ai/PracticeResult";
import { aiApi } from "@/features/ai/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Practice } from "@/types";

/** FR-10.x — xem lại kết quả một buổi luyện phỏng vấn với AI (chủ buổi hoặc admin). */
function PracticeDetail({ id }: { id: string }) {
  const [practice, setPractice] = useState<Practice | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    aiApi.practice(id).then(setPractice).catch((e) => { setError(errorMessage(e)); setPractice(null); });
  }, [id]);

  if (practice === undefined) return <Loading />;
  return (
    <>
      <PageHeader title="Kết quả luyện phỏng vấn" back={{ href: "/practice-interview", label: "Luyện phỏng vấn với AI" }}
        description={practice ? `${practiceTitle(practice)} · ${formatDateTime(practice.createdAt)}` : undefined} />
      <Alert className="mb-6">{error}</Alert>
      {practice && <PracticeResultView practice={practice} />}
    </>
  );
}

export default function PracticeDetailPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["MENTEE", "ADMIN"]}>
      <PracticeDetail id={params.id} />
    </RequireAuth>
  );
}
