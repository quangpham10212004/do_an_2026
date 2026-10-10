"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Handshake } from "lucide-react";
import { Alert, Avatar, Badge, ButtonLink, Card, EmptyState, List, ListRow, Loading, PageHeader } from "@/components/ui";
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
      <PageHeader title="Quan hệ mentoring" description="Mục tiêu chung, phiên học và ghi chú của từng quan hệ mentoring." />
      <Alert className="mb-6">{error}</Alert>
      {!items ? (error ? null : <Loading />) : (
        <Card>
          {items.length === 0 ? (
            <EmptyState icon={Handshake} title="Chưa có quan hệ mentoring nào"
              action={!isMentor && <ButtonLink href="/matching" size="sm">Tìm mentor</ButtonLink>}>
              Khi mentor chấp nhận yêu cầu, không gian mentoring sẽ xuất hiện ở đây.
            </EmptyState>
          ) : (
            <List>
              {items.map((r) => {
                const name = isMentor ? r.menteeName : r.mentorName;
                const active = r.status === "ACCEPTED";
                return (
                  <ListRow
                    key={r.id}
                    href={`/mentoring/relationships/${r.id}`}
                    leading={<Avatar name={name} />}
                    title={<span className="inline-flex flex-wrap items-center gap-2">{name}<Badge tone={active ? "success" : "neutral"}>{RELATIONSHIP_STATUS_LABELS[r.status] || r.status}</Badge></span>}
                    meta={<>Bắt đầu {formatDate(r.respondedAt || r.createdAt)} · {r.goal.length > 140 ? `${r.goal.slice(0, 140)}…` : r.goal}</>}
                    trailing={<span className="text-small font-medium text-accent">{active ? "Mở không gian" : "Xem lại"}</span>}
                  />
                );
              })}
            </List>
          )}
        </Card>
      )}
    </>
  );
}

export default function RelationshipsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Relationships user={user} />}</RequireAuth>;
}
