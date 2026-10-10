"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Bell, CheckCheck } from "lucide-react";
import { Alert, Button, ButtonLink, Card, EmptyState, List, ListRow, Loading, PageHeader } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { NotificationList } from "@/types";

function Notifications() {
  const [data, setData] = useState<NotificationList | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () => mentoringApi.notifications(100).then((d) => { setData(d); setError(""); }).catch((e) => setError(errorMessage(e))),
    []
  );
  const mark = (promise: Promise<unknown>) => promise.then(load).catch((e: unknown) => setError(errorMessage(e)));
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  return (
    <div className="max-w-[860px]">
      <PageHeader
        title="Thông báo"
        description={data.unreadCount ? `${data.unreadCount} thông báo chưa đọc` : "Bạn đã đọc hết thông báo."}
        actions={<Button icon={CheckCheck} onClick={() => mark(mentoringApi.markAllRead())} disabled={data.unreadCount === 0}>Đánh dấu tất cả đã đọc</Button>}
      />
      <Alert className="mb-6">{error}</Alert>
      <Card>
        {data.items.length === 0 ? <EmptyState icon={Bell} title="Chưa có thông báo nào">Yêu cầu, phiên học và tin nhắn mới sẽ được báo ở đây.</EmptyState> : (
          <List>
            {data.items.map((n) => (
              <ListRow
                key={n.id}
                unread={!n.read}
                leading={<span className={`mt-1.5 size-2 flex-none self-start rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`} aria-label={n.read ? undefined : "Chưa đọc"} />}
                title={n.title}
                meta={<>{n.message}<span className="mt-0.5 block text-ink-subtle tabular">{formatDateTime(n.createdAt)}</span></>}
                trailing={<>
                  {n.link && (
                    <span onClick={() => !n.read && mentoringApi.markRead(n.id).catch(() => {})}>
                      <ButtonLink href={n.link} size="sm">Xem</ButtonLink>
                    </span>
                  )}
                  {!n.read && <Button size="sm" variant="ghost" onClick={() => mark(mentoringApi.markRead(n.id))}>Đã đọc</Button>}
                </>}
              />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}
