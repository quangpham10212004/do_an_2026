"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { MessageSquare } from "lucide-react";
import { Alert, Avatar, Card, Count, EmptyState, List, ListRow, Loading, PageHeader } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ConversationSummary } from "@/types";

/** US-33 (PRD-MSG-1/2) — hộp thư: mỗi yêu cầu mentoring là một cuộc trò chuyện. */
function Inbox() {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () =>
      mentoringApi.conversations()
        .then((res) => active && setItems(res))
        .catch((e) => active && (setItems((cur) => cur ?? []), setError(errorMessage(e))));
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <PageHeader title="Tin nhắn" description="Mỗi yêu cầu mentoring là một cuộc trò chuyện với mentor hoặc mentee." />
      <Alert className="mb-6">{error}</Alert>
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? (
            <EmptyState icon={MessageSquare} title="Chưa có cuộc trò chuyện nào">Cuộc trò chuyện mở khi một yêu cầu mentoring được gửi.</EmptyState>
          ) : (
            <List>
              {items.map((c) => (
                <ListRow
                  key={c.id}
                  href={`/messages/${c.id}`}
                  unread={c.unread > 0}
                  leading={<Avatar name={c.counterpartName} />}
                  title={<span className="inline-flex flex-wrap items-center gap-2">
                    {c.counterpartName || "Người dùng"}
                    <span className="text-small font-normal text-ink-muted">{c.counterpartRole === "MENTOR" ? "Mentor" : "Mentee"}</span>
                    <MentoringStatusBadge status={c.requestStatus} />
                  </span>}
                  meta={<span className="block truncate">
                    {c.lastMessage ? `${c.lastFromMe ? "Bạn: " : ""}${c.lastMessage}` : "Chưa có tin nhắn"}
                    {!c.writable && " · chỉ xem"}
                  </span>}
                  trailing={<>
                    {c.lastMessageAt && <span className="text-small text-ink-subtle tabular">{formatDateTime(c.lastMessageAt)}</span>}
                    <Count value={c.unread} />
                  </>}
                />
              ))}
            </List>
          )}
        </Card>
      )}
    </>
  );
}

export default function MessagesPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Inbox />}</RequireAuth>;
}
