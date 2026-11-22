"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Ticket } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Badge, Button, ButtonLink, EmptyState, Loading, PageHeader, Tabs, type BadgeTone } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { referralApi, type Voucher, type VoucherStatus } from "@/features/referral/api";

const TAB_LABELS: Record<VoucherStatus, string> = { ACTIVE: "Dùng được", PENDING: "Chờ giải phóng", USED: "Đã dùng", EXPIRED: "Hết hạn" };
const BADGE: Record<VoucherStatus, { tone: BadgeTone; label: string }> = {
  ACTIVE: { tone: "success", label: "Dùng được" },
  PENDING: { tone: "warning", label: "Chờ 7 ngày" },
  USED: { tone: "neutral", label: "Đã dùng" },
  EXPIRED: { tone: "danger", label: "Hết hạn" },
};
const DAY = 86_400_000;

function daysLeft(iso: string | null): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / DAY) : null;
}

function VoucherCard({ v }: { v: Voucher }) {
  const [copied, setCopied] = useState(false);
  const left = v.status === "ACTIVE" ? daysLeft(v.expiresAt) : null;
  const soon = left != null && left <= 14;
  const b = BADGE[v.status];

  async function copy() {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* trình duyệt chặn clipboard: người dùng tự chọn mã */ }
  }

  return (
    <article className="rf-voucher" data-state={v.status.toLowerCase()}>
      <div className="rf-amount" aria-label={`Giảm ${formatMoney(v.amount)}`}>
        <b>{v.amount.toLocaleString("vi-VN")}</b>
        <span>đồng</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{v.title}</strong>
          <Badge tone={b.tone}>{b.label}</Badge>
        </div>
        {v.status === "PENDING" ? (
          <p className="mt-1 text-small text-ink-muted">Mã sẽ có vào {formatDate(v.releaseAt)} nếu buổi học không bị hoàn tiền.</p>
        ) : (
          <>
            <p className="mt-1 text-small text-ink-muted">
              Mã <span className="font-mono font-semibold text-ink">{v.code}</span>
              {v.status === "USED" ? ` · dùng ngày ${formatDate(v.usedAt)}` : v.expiresAt ? ` · ${v.status === "EXPIRED" ? "đã hết hạn" : "hết hạn"} ${formatDate(v.expiresAt)}` : ""}
            </p>
            {v.status === "USED" && v.usedNote && <p className="text-small text-ink-muted">{v.usedNote}</p>}
            {v.status === "ACTIVE" && (
              <p className="text-small text-ink-muted">Áp dụng cho mọi phiên từ {formatMoney(v.minOrder)}, với bất kỳ mentor nào.</p>
            )}
            {soon && <p className="rf-soon text-small">Sắp hết hạn trong {Math.max(left!, 0)} ngày.</p>}
          </>
        )}
        {v.status === "ACTIVE" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={copied ? Check : Copy} onClick={copy} aria-label={`Sao chép mã ${v.code}`}>{copied ? "Đã sao chép" : "Sao chép mã"}</Button>
            <ButtonLink size="sm" variant="primary" href="/matching">Đặt phiên và dùng ngay</ButtonLink>
          </div>
        )}
      </div>
    </article>
  );
}

function Vouchers() {
  const [list, setList] = useState<Voucher[] | null | undefined>(undefined);
  const [tab, setTab] = useState<VoucherStatus>("ACTIVE");

  useEffect(() => {
    referralApi.vouchers().then(setList).catch(() => setList(null));
  }, []);

  const counts = useMemo(() => {
    const c: Record<VoucherStatus, number> = { ACTIVE: 0, PENDING: 0, USED: 0, EXPIRED: 0 };
    list?.forEach((v) => { c[v.status]++; });
    return c;
  }, [list]);

  if (list === undefined) return <Loading />;
  if (!list) return <Alert>Không tải được mã giảm giá. Thử lại sau.</Alert>;
  const shown = list.filter((v) => v.status === tab).sort((a, b) => (a.expiresAt ?? a.releaseAt ?? "").localeCompare(b.expiresAt ?? b.releaseAt ?? ""));

  return (
    <>
      <PageHeader back={{ href: "/referral", label: "Giới thiệu bạn bè" }} title="Mã giảm giá của tôi"
        description="Nhận từ việc giới thiệu bạn bè. Dùng khi thanh toán phiên học." />
      <Tabs className="mb-6" value={tab} onChange={setTab}
        tabs={(Object.keys(TAB_LABELS) as VoucherStatus[]).map((s) => ({ id: s, label: TAB_LABELS[s], count: counts[s] }))} />
      {shown.length === 0 ? (
        <EmptyState icon={Ticket} title={`Chưa có mã ${TAB_LABELS[tab].toLowerCase()}`}
          action={tab === "ACTIVE" ? <ButtonLink href="/referral/share" variant="primary">Giới thiệu bạn bè</ButtonLink> : undefined}>
          {tab === "ACTIVE" ? "Giới thiệu mentor cho bạn bè để nhận mã giảm giá." : "Các mã ở trạng thái này sẽ hiện ở đây."}
        </EmptyState>
      ) : (
        <div className="flex max-w-[760px] flex-col gap-3">
          {shown.map((v) => <VoucherCard key={v.id} v={v} />)}
        </div>
      )}
    </>
  );
}

export default function VouchersPage() {
  return <RequireAuth roles={["MENTEE"]}><Vouchers /></RequireAuth>;
}
