"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Bell, CalendarClock, CheckCheck, CreditCard, Info, PenLine, type LucideIcon } from "lucide-react";
import { Alert, Button, ButtonLink, EmptyState, Loading, PageHeader, Tabs } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { notificationAction } from "@/features/sesx/api";
import NotificationSettings from "@/features/socialx/NotificationSettings";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { Notification, NotificationList } from "@/types";

type Filter = "all" | "unread" | "session" | "payment" | "blog" | "system";

/** Phân nhóm theo tiền tố mã loại thông báo do backend gửi. */
function groupOf(type: string): Exclude<Filter, "all" | "unread"> {
  if (/^(SESSION|ATTENDANCE|REQUEST|MENTORING|BOOKING|REMINDER|REVIEW|MESSAGE)/.test(type)) return "session";
  if (/^(PAYMENT|WALLET|REFUND|PAYOUT|INVOICE|PROMO|REFERRAL|COUPON)/.test(type)) return "payment";
  if (/^(BLOG|POST|COMMENT|FOLLOW|LIKE)/.test(type)) return "blog";
  return "system";
}
const ICONS: Record<string, LucideIcon> = { session: CalendarClock, payment: CreditCard, blog: PenLine, system: Info };

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  return diff <= 0 ? "Hôm nay" : diff === 1 ? "Hôm qua" : "Trước đó";
}

function Notifications() {
  const [data, setData] = useState<NotificationList | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(30);
  const load = useCallback(
    () => mentoringApi.notifications(limit).then((d) => { setData(d); setError(""); }).catch((e) => setError(errorMessage(e))),
    [limit]
  );
  const mark = (promise: Promise<unknown>) => promise.then(load).catch((e: unknown) => setError(errorMessage(e)));
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.items;
    if (filter === "unread") return data.items.filter((n) => !n.read);
    return data.items.filter((n) => groupOf(n.type) === filter);
  }, [data, filter]);
  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    shown.forEach((n) => {
      const k = dayLabel(n.createdAt);
      map.set(k, [...(map.get(k) ?? []), n]);
    });
    return Array.from(map.entries());
  }, [shown]);

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  return (
    <div>
      <PageHeader
        title="Thông báo"
        description={data.unreadCount ? `${data.unreadCount} thông báo chưa đọc.` : "Bạn đã đọc hết thông báo."}
        actions={<Button icon={CheckCheck} onClick={() => mark(mentoringApi.markAllRead())} disabled={data.unreadCount === 0}>Đánh dấu tất cả đã đọc</Button>}
      />
      <Alert className="mb-4">{error}</Alert>
      <Tabs className="mb-2" value={filter} onChange={setFilter} tabs={[
        { id: "all", label: "Tất cả" },
        { id: "unread", label: "Chưa đọc", count: data.unreadCount },
        { id: "session", label: "Phiên học" },
        { id: "payment", label: "Thanh toán" },
        { id: "blog", label: "Blog" },
        { id: "system", label: "Hệ thống" },
      ]} />
      <div className="sc-notif-layout">
      <div className="sc-notif-list">
      {groups.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-border bg-surface">
          <EmptyState icon={Bell} title="Bạn đã xem hết thông báo">Thông báo mới về phiên học, thanh toán và blog sẽ hiện ở đây.</EmptyState>
        </div>
      ) : groups.map(([label, list]) => (
        <section key={label} aria-label={label}>
          <h2 className="sc-day">{label}</h2>
          <ul className="sc-notifs">
            {list.map((n) => {
              const Icon = ICONS[groupOf(n.type)] ?? Bell;
              const action = notificationAction(n);
              return (
                <li key={n.id} className="sc-notif" data-unread={!n.read}>
                  <span className="sc-notif-ico" aria-hidden="true"><Icon /></span>
                  <div className="sc-notif-main">
                    <b>{n.title}{!n.read && <span className="sr-only"> (chưa đọc)</span>}</b>
                    <p>{n.message}</p>
                    <time dateTime={n.createdAt} className="tabular">{formatDateTime(n.createdAt)}</time>
                  </div>
                  <div className="sc-notif-actions">
                    {n.link && (
                      <span onClick={() => !n.read && mentoringApi.markRead(n.id).catch(() => {})}>
                        {action ? <ButtonLink href={n.link} size="sm" variant="primary" aria-label={`${action}: ${n.title}`}>{action}</ButtonLink>
                          : <ButtonLink href={n.link} size="sm" aria-label={`Xem: ${n.title}`}>Xem</ButtonLink>}
                      </span>
                    )}
                    {!n.read && <Button size="sm" variant="ghost" aria-label={`Đánh dấu đã đọc: ${n.title}`} onClick={() => mark(mentoringApi.markRead(n.id))}>Đã đọc</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {data.items.length >= limit && (
        <div className="sc-notif-more">
          <Button onClick={() => setLimit((l) => l + 30)}>Xem thông báo cũ hơn</Button>
        </div>
      )}
      </div>
      <aside className="sc-notif-side" aria-label="Cách nhận thông báo"><NotificationSettings /></aside>
      </div>
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
