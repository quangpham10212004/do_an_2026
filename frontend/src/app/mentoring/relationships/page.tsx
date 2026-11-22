"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Handshake } from "lucide-react";
import { Alert, ButtonLink, Card, EmptyState, Loading } from "@/components/ui";
import { FlowHead, FlowMini, FlowPill, FlowTile } from "@/features/mentoring/FlowKit";
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
    <div className="fl-page">
      <FlowHead title="Quan hệ mentoring" lead="Mục tiêu chung, phiên học và ghi chú của từng quan hệ mentoring." />
      <Alert className="mb-6">{error}</Alert>
      {!items ? (error ? null : <Loading />) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Handshake} title="Chưa có quan hệ mentoring nào"
            action={!isMentor && <ButtonLink href="/matching" size="sm">Tìm mentor</ButtonLink>}>
            Khi mentor chấp nhận yêu cầu, không gian mentoring sẽ xuất hiện ở đây.
          </EmptyState>
        </Card>
      ) : (
        <div className="fl-list" style={{ maxWidth: 900 }}>
          {items.map((r) => {
            const name = isMentor ? r.menteeName : r.mentorName;
            const active = r.status === "ACCEPTED";
            return (
              <article key={r.id} className="fl-req" data-open={active} aria-label={`Quan hệ với ${name}`}>
                <div className="fl-req-top">
                  <FlowTile name={name} tone={active ? undefined : "muted"} />
                  <div className="fl-req-name">
                    <div className="fl-req-badges">
                      <b>{name}</b>
                      <FlowPill tone={active ? "success" : undefined}>{RELATIONSHIP_STATUS_LABELS[r.status] || r.status}</FlowPill>
                    </div>
                    <div className="fl-req-sub">Bắt đầu {formatDate(r.respondedAt || r.createdAt)}</div>
                    <div className="fl-req-sub fl-req-line">{r.goal}</div>
                  </div>
                  <ButtonLink href={`/mentoring/relationships/${r.id}`} variant={active ? "primary" : "secondary"}>{active ? "Mở không gian" : "Xem lại"}</ButtonLink>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RelationshipsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Relationships user={user} />}</RequireAuth>;
}
