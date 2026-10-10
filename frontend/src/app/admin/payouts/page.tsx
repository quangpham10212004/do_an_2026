"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, useDialog } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { Payout, PayoutStatus } from "@/types";

const FILTERS: [PayoutStatus | "", string][] = [["REQUESTED", "Chờ chuyển"], ["PAID", "Đã chuyển"], ["REJECTED", "Từ chối"], ["", "Tất cả"]];

/** US-42 (PRD-PAY-5) — admin chuyển khoản (sandbox) rồi đánh dấu PAID kèm mã tham chiếu, hoặc từ chối. */
function Payouts() {
  const [filter, setFilter] = useState<PayoutStatus | "">("REQUESTED");
  const [items, setItems] = useState<Payout[] | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [dialog, ask] = useDialog();
  const load = useCallback(() => {
    setItems(null);
    paymentApi.adminPayouts(filter).then(setItems).catch((e) => { setItems([]); setMsg({ error: errorMessage(e) }); });
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  };
  return (
    <>
      {dialog}
      <PageHead title="Rút tiền" subtitle="Yêu cầu rút toàn bộ số dư khả dụng của mentor (tối thiểu 200.000đ)." />
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="tabs">
        {FILTERS.map(([v, l]) => <button key={v || "ALL"} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      {!items ? <Loading /> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Yêu cầu lúc</th><th>Mentor</th><th>Số tiền</th><th>Tài khoản</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>Không có yêu cầu nào.</td></tr>}
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.requestedAt)}</td>
                  <td>{p.mentorName}</td>
                  <td><strong>{formatVnd(p.amount)}</strong></td>
                  <td className="small">{p.bankName}<br />{p.accountNumber} · {p.holderName}</td>
                  <td className="small">{p.status}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</td>
                  <td>
                    {p.status === "REQUESTED" && (
                      <div className="row">
                        <button className="btn sm" onClick={async () => {
                          const ref = await ask({ title: `Đã chuyển ${formatVnd(p.amount)}?`, input: { label: "Mã tham chiếu chuyển khoản", maxLength: 100 }, confirmText: "Đánh dấu đã chuyển" });
                          if (typeof ref === "string" && ref.trim()) act(() => paymentApi.markPayoutPaid(p.id, ref.trim()), "Đã đánh dấu đã chuyển.");
                        }}>Đã chuyển</button>
                        <button className="btn secondary sm" onClick={async () => {
                          const reason = await ask({ title: "Từ chối yêu cầu rút tiền?", input: { label: "Lý do", maxLength: 500 }, confirmText: "Từ chối", danger: true });
                          if (typeof reason === "string" && reason.trim()) act(() => paymentApi.rejectPayout(p.id, reason.trim()), "Đã từ chối.");
                        }}>Từ chối</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminPayoutsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Payouts />}</RequireAuth>;
}
