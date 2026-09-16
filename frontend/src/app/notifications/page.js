"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Empty, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { formatDateTime } from "@/lib/format";

function Notifications() {
  const [data, setData] = useState(null);
  const load = useCallback(() => mentoringApi.notifications(100).then(setData), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Loading />;
  return (
    <>
      <PageHead title="Thông báo" subtitle={`${data.unreadCount} thông báo chưa đọc`}>
        <button className="btn secondary" onClick={() => mentoringApi.markAllRead().then(load)} disabled={data.unreadCount === 0}>
          Đánh dấu tất cả đã đọc
        </button>
      </PageHead>
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
                <Link className="btn secondary sm" href={n.link} onClick={() => !n.read && mentoringApi.markRead(n.id)}>
                  Xem
                </Link>
              )}
              {!n.read && (
                <button className="btn ghost sm" onClick={() => mentoringApi.markRead(n.id).then(load)}>
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
