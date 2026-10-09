"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
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
      <PageHead title="Tin nhắn" subtitle="Trao đổi với mentor / mentee ngay trong từng yêu cầu mentoring." />
      <Alert>{error}</Alert>
      {!items ? <Loading /> : items.length === 0 ? (
        <Empty>Chưa có cuộc trò chuyện nào. Cuộc trò chuyện mở khi một yêu cầu mentoring được gửi.</Empty>
      ) : (
        <div className="stack">
          {items.map((c) => (
            <Link key={c.id} href={`/messages/${c.id}`} className="card list-item" style={{ textDecoration: "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {c.counterpartName || "Người dùng"}{" "}
                    <span className="muted small">· {c.counterpartRole === "MENTOR" ? "mentor" : "mentee"}</span>
                  </strong>
                  <span className="row">
                    <MentoringStatusBadge status={c.requestStatus} />
                    {c.unread > 0 && <span className="badge bad">{c.unread} chưa đọc</span>}
                  </span>
                </div>
                <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.lastMessage ? `${c.lastFromMe ? "Bạn: " : ""}${c.lastMessage}` : "Chưa có tin nhắn"}
                  {c.lastMessageAt && ` · ${formatDateTime(c.lastMessageAt)}`}
                  {!c.writable && " · chỉ xem"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function MessagesPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Inbox />}</RequireAuth>;
}
