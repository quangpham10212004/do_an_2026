"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
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
    <>
      <PageHead title="Thông báo" subtitle={`${data.unreadCount} thông báo chưa đọc`}>
        <button className="btn secondary" onClick={() => mark(mentoringApi.markAllRead())} disabled={data.unreadCount === 0}>
          Đánh dấu tất cả đã đọc
        </button>
      </PageHead>
      <Alert>{error}</Alert>
      <div className="card">
        {data.items.length === 0 && <Empty>Chưa có thông báo nào.</Empty>}
        {data.items.map((n) => (
          <div className="list-item" key={n.id} style={{ opacity: n.read ? 0.65 : 1 }}>
            <div style={{ flex: 1 }}>
              <div className="row">
                <strong>{n.title}</strong>
                {!n.read && <span className="badge primary">Mới</span>}
              </div>
              <div>{n.message}</div>
              <div className="muted small">{formatDateTime(n.createdAt)}</div>
            </div>
            <div className="row">
              {n.link && (
                <Link className="btn secondary sm" href={n.link} onClick={() => !n.read && mentoringApi.markRead(n.id).catch(() => {})}>
                  Xem
                </Link>
              )}
              {!n.read && (
                <button className="btn ghost sm" onClick={() => mark(mentoringApi.markRead(n.id))}>
                  Đã đọc
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}
