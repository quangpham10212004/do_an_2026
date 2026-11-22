"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { BellOff, MessageSquare, Search } from "lucide-react";
import { Alert, Avatar, Count, EmptyState, Input, Loading, PageHeader, Tabs } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { messageX } from "@/features/socialx/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ConversationSummary } from "@/types";

/** US-33 (PRD-MSG-1/2) — hộp thư: mỗi yêu cầu mentoring là một cuộc trò chuyện. */
function Inbox() {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [q, setQ] = useState("");
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());

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

  const ids = (items ?? []).map((c) => c.id).join(",");
  useEffect(() => {
    if (!ids) return;
    Promise.all(ids.split(",").map((cid) => messageX.getMuted(cid).then((m) => (m ? cid : null)).catch(() => null)))
      .then((list) => setMutedIds(new Set(list.filter((x): x is string => !!x))));
  }, [ids]);

  const unread = items?.filter((c) => c.unread > 0).length ?? 0;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((c) =>
      (tab === "all" || c.unread > 0) &&
      (!needle || `${c.counterpartName ?? ""} ${c.lastMessage ?? ""}`.toLowerCase().includes(needle)));
  }, [items, tab, q]);

  return (
    <div className="max-w-[860px]">
      <PageHeader title="Tin nhắn" description="Mỗi yêu cầu mentoring là một cuộc trò chuyện với mentor hoặc mentee." />
      <Alert className="mb-4">{error}</Alert>
      {!items ? <Loading /> : (
        <section className="sc-inbox" aria-label="Danh sách hội thoại">
          <div className="sc-inbox-head">
            <Tabs value={tab} onChange={setTab} tabs={[{ id: "all", label: "Tất cả" }, { id: "unread", label: "Chưa đọc", count: unread }]} />
            <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
              <Input aria-label="Tìm hội thoại" className="!pl-9" placeholder="Tìm người hoặc nội dung" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={MessageSquare} title={items.length === 0 ? "Chưa có cuộc trò chuyện nào" : "Không có hội thoại phù hợp"}>
              {items.length === 0 ? "Cuộc trò chuyện mở khi một yêu cầu mentoring được gửi." : "Thử đổi bộ lọc hoặc từ khoá tìm kiếm."}
            </EmptyState>
          ) : (
            <ul>
              {shown.map((c) => (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} className="sc-conv" data-unread={c.unread > 0}>
                    <Avatar name={c.counterpartName} />
                    <div className="grow">
                      <div className="top">
                        <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                          <b className="truncate">{c.counterpartName || "Người dùng"}</b>
                          <span className="text-small font-normal text-ink-muted">{c.counterpartRole === "MENTOR" ? "Mentor" : "Mentee"}</span>
                          <MentoringStatusBadge status={c.requestStatus} />
                        </span>
                        {c.lastMessageAt && <time dateTime={c.lastMessageAt} className="tabular">{formatDateTime(c.lastMessageAt)}</time>}
                      </div>
                      <div className="last">
                        {c.lastMessage ? `${c.lastFromMe ? "Bạn: " : ""}${c.lastMessage}` : "Chưa có tin nhắn"}
                        {!c.writable && " · chỉ xem"}
                      </div>
                    </div>
                    {mutedIds.has(c.id) && <><BellOff aria-hidden="true" className="size-4 flex-none text-ink-subtle" /><span className="sr-only">Đã tắt thông báo</span></>}
                    {c.unread > 0 && <><Count value={c.unread} /><span className="sr-only">tin chưa đọc</span></>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{() => <Inbox />}</RequireAuth>;
}
