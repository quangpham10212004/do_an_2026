"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
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
      <PageHead title="Giao dịch" subtitle={isMentor ? "Thu nhập từ các phiên mentoring (đã trừ phí nền tảng)." : "Các khoản thanh toán và hoàn tiền của bạn."} />
      <Alert>{error}</Alert>
      {isMentor && items.length > 0 && (
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card"><div className="muted small">Thu nhập (sau phí)</div><div className="stat">{formatMoney(earned)}</div></div>
          <div className="card"><div className="muted small">Đang tạm giữ (tranh chấp)</div><div className="stat">{formatMoney(onHold)}</div></div>
        </div>
      )}
      <div className="card">
        {items.length === 0 && <Empty>Chưa có giao dịch nào.</Empty>}
        {items.map((t) => (
          <div key={t.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="row between">
              <span>
                <strong>{formatMoney(t.amount)}</strong> <span className="muted small">· {formatDateTime(t.createdAt)}</span>
              </span>
              <MentoringStatusBadge status={t.status} />
            </div>
            {t.status === "FAILED" ? (
              <div className="small muted">{paymentReasonLabel(t.failureReason)}</div>
            ) : (
              <div className="small muted">
                Phí nền tảng {feePercent(t.feeRate)}: {formatMoney(t.fee)} · Mentor nhận: {formatMoney(t.mentorEarning)}
                {t.holdReason && t.status === "ON_HOLD" && ` · Tạm giữ: ${paymentReasonLabel(t.holdReason)}`}
              </div>
            )}
            {t.status !== "FAILED" && t.status !== "PENDING" && (
              <Link className="small" href={`/payment/receipts/${t.id}`}>Biên lai</Link>
            )}
            {t.refunds.map((r) => (
              <div key={r.id} className="small">
                Hoàn {formatMoney(r.amount)} · {formatDateTime(r.createdAt)}{r.reason && ` · ${paymentReasonLabel(r.reason)}`}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export default function TransactionsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Transactions user={user} />}</RequireAuth>;
}
