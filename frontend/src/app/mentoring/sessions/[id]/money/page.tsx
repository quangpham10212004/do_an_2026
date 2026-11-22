"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import SessionMoney from "@/features/mentoring/SessionMoney";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MentoringSession } from "@/types";

function Money({ isMentor }: { isMentor: boolean }) {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<MentoringSession | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    mentoringApi.session(id).then(setS).catch((e) => setError(errorMessage(e)));
  }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!s) return <Loading />;
  const other = isMentor ? s.menteeName : s.mentorName;
  return (
    <>
      <PageHeader
        back={{ href: `/mentoring/sessions/${s.id}`, label: `${s.topic || "Phiên học"} · ${other} · ${formatDateTime(s.scheduledAt)}` }}
        title="Dòng tiền của phiên"
        description="Theo dõi học phí từ lúc được giữ đến khi vào ví mentor."
      />
      <div className="max-w-3xl"><SessionMoney session={s} isMentor={isMentor} /></div>
    </>
  );
}

export default function SessionMoneyPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(u) => <Money isMentor={u.role === "MENTOR"} />}</RequireAuth>;
}
