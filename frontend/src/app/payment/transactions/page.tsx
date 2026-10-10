"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Receipt } from "lucide-react";
import { Alert, Card, EmptyState, Loading, PageHeader, Stat, Stats } from "@/components/ui";
import { feePercent, paymentApi, paymentReasonLabel } from "@/features/payment/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { SessionUser, Transaction } from "@/types";

/** US-13 — giao dịch của tôi: mentee thấy số đã trả / đã hoàn; mentor thấy phí nền tảng và phần thực nhận. */
function Transactions({ user }: { user: SessionUser }) {
  const [items, setItems] = useState<Transaction[] | undefined>(undefined);
  const [error, setError] = useState("");
  const isMentor = user.role === "MENTOR";

  useEffect(() => {
    paymentApi.transactions().then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, []);

  if (items === undefined) return <Loading />;
  const earned = items
    .filter((t) => t.status === "SUCCESS" || t.status === "PARTIALLY_REFUNDED")
    .reduce((sum, t) => sum + Number(t.mentorEarning), 0);
  const onHold = items.filter((t) => t.status === "ON_HOLD").reduce((sum, t) => sum + Number(t.mentorEarning), 0);

  return (
    <>
      <PageHeader title="Giao dịch" description={isMentor ? "Thu nhập từ các phiên mentoring, đã trừ phí nền tảng." : "Các khoản thanh toán và hoàn tiền của bạn."} />
      <Alert className="mb-6">{error}</Alert>
      {isMentor && items.length > 0 && (
        <div className="mb-6">
          <Stats>
            <Stat label="Thu nhập (sau phí)" value={formatMoney(earned)} />
            <Stat label="Đang tạm giữ (tranh chấp)" value={formatMoney(onHold)} />
          </Stats>
        </div>
      )}
      <Card>
        {items.length === 0 ? <EmptyState icon={Receipt} title="Chưa có giao dịch nào">Giao dịch xuất hiện sau khi phiên có phí được thanh toán.</EmptyState> : (
          <div className="flex flex-col divide-y divide-border">
            {items.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-4 max-sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-title-3 font-medium tabular">{formatMoney(t.amount)}</span>
                    <MentoringStatusBadge status={t.status} />
                  </div>
                  <div className="text-small text-ink-subtle tabular">{formatDateTime(t.createdAt)}</div>
                  <div className="mt-1 text-small text-ink-muted">
                    {t.status === "FAILED" ? paymentReasonLabel(t.failureReason) : <>
                      Phí nền tảng {feePercent(t.feeRate)}: {formatMoney(t.fee)} · Mentor nhận: {formatMoney(t.mentorEarning)}
                      {t.holdReason && t.status === "ON_HOLD" && ` · Tạm giữ: ${paymentReasonLabel(t.holdReason)}`}
                    </>}
                  </div>
                  {t.refunds.map((r) => (
                    <div key={r.id} className="text-small text-ink-muted">
                      Hoàn {formatMoney(r.amount)} · {formatDateTime(r.createdAt)}{r.reason && ` · ${paymentReasonLabel(r.reason)}`}
                    </div>
                  ))}
                </div>
                {t.status !== "FAILED" && t.status !== "PENDING" && (
                  <Link className="btn btn-sm btn-ghost" href={`/payment/receipts/${t.id}`}>Biên lai</Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default function TransactionsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Transactions user={user} />}</RequireAuth>;
}
