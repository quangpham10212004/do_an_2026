"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MentoringRequest, SessionUser } from "@/types";
import { RELATIONSHIP_STATUS_LABELS, workspaceApi } from "./workspace";

/** US-28 — danh sách quan hệ mentoring (yêu cầu đã được chấp nhận) dẫn tới không gian mentoring. */
function Relationships({ user }: { user: SessionUser }) {
  const [items, setItems] = useState<MentoringRequest[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    workspaceApi.mine().then(setItems).catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const isMentor = user.role === "MENTOR";
  return (
    <>
      <PageHead title="Không gian mentoring" subtitle="Mục tiêu chung và các buổi học của từng quan hệ mentoring." />
      <Alert>{error}</Alert>
      {!items ? (error ? null : <Loading />) : items.length === 0 ? (
        <Empty>Chưa có quan hệ mentoring nào. Khi mentor chấp nhận yêu cầu, không gian mentoring sẽ xuất hiện ở đây.</Empty>
      ) : (
        <div className="stack">
          {items.map((r) => (
            <div key={r.id} className="card row between">
              <div>
                <strong>{isMentor ? r.menteeName : r.mentorName}</strong>
                <div className="small muted">
                  {RELATIONSHIP_STATUS_LABELS[r.status] || r.status} · bắt đầu {formatDate(r.respondedAt || r.createdAt)}
                </div>
                <div className="small" style={{ marginTop: 4 }}>{r.goal.length > 140 ? `${r.goal.slice(0, 140)}…` : r.goal}</div>
              </div>
              <Link className={`btn sm ${r.status === "ACCEPTED" ? "" : "secondary"}`} href={`/mentoring/relationships/${r.id}`}>
                {r.status === "ACCEPTED" ? "Mở không gian" : "Xem lại"}
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function RelationshipsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Relationships user={user} />}</RequireAuth>;
}
