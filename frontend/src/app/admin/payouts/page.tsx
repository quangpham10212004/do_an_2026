"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Banknote } from "lucide-react";
import { Badge, Button, Card, EmptyState, FlashAlerts, Loading, PageHeader, Table, Tabs, useDialog, type BadgeTone } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { Payout, PayoutStatus } from "@/types";

const FILTERS: [PayoutStatus | "", string][] = [["REQUESTED", "Chờ chuyển"], ["PAID", "Đã chuyển"], ["REJECTED", "Từ chối"], ["", "Tất cả"]];
const PAYOUT_TONE: Record<string, [string, BadgeTone]> = { REQUESTED: ["Chờ chuyển", "warning"], PAID: ["Đã chuyển", "success"], REJECTED: ["Từ chối", "danger"] };

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
      <PageHeader title="Rút tiền" description="Yêu cầu rút toàn bộ số dư khả dụng của mentor (tối thiểu 200.000 đ). Chuyển khoản rồi đánh dấu đã chuyển kèm mã tham chiếu." />
      <FlashAlerts flash={msg} className="mb-6" />
      <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={FILTERS.map(([v, l]) => ({ id: v, label: l }))} />
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={Banknote} title="Không có yêu cầu nào" /> : (
            <Table>
              <thead><tr><th>Yêu cầu lúc</th><th>Mentor</th><th className="num">Số tiền</th><th>Tài khoản</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {items.map((p) => {
                  const [label, tone] = PAYOUT_TONE[p.status] ?? [p.status, "neutral"];
                  return (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{formatDateTime(p.requestedAt)}</td>
                      <td className="font-medium">{p.mentorName}</td>
                      <td className="num font-semibold">{formatVnd(p.amount)}</td>
                      <td className="text-small">
                        <div>{p.bankName}</div>
                        <div className="text-ink-muted"><span className="font-mono">{p.accountNumber}</span> · {p.holderName}</div>
                      </td>
                      <td className="text-small">
                        <Badge tone={tone}>{label}</Badge>
                        {(p.reference || p.note) && <div className="mt-1 text-ink-muted">{p.reference && <span className="font-mono">{p.reference}</span>}{p.reference && p.note ? " · " : ""}{p.note}</div>}
                      </td>
                      <td className="actions">
                        {p.status === "REQUESTED" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={async () => {
                              const reason = await ask({ title: "Từ chối yêu cầu rút tiền?", input: { label: "Lý do", maxLength: 500 }, confirmText: "Từ chối", danger: true });
                              if (typeof reason === "string" && reason.trim()) act(() => paymentApi.rejectPayout(p.id, reason.trim()), "Đã từ chối yêu cầu.");
                            }}>Từ chối</Button>
                            <Button size="sm" variant="primary" onClick={async () => {
                              const ref = await ask({ title: `Đã chuyển ${formatVnd(p.amount)}?`, input: { label: "Mã tham chiếu chuyển khoản", maxLength: 100 }, confirmText: "Đánh dấu đã chuyển" });
                              if (typeof ref === "string" && ref.trim()) act(() => paymentApi.markPayoutPaid(p.id, ref.trim()), "Đã đánh dấu đã chuyển.");
                            }}>Đã chuyển</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

export default function AdminPayoutsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Payouts />}</RequireAuth>;
}
