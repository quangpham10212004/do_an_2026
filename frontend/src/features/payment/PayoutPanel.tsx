"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Landmark } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, FlashAlerts, Input, List, ListRow, type BadgeTone } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { PayoutOverview } from "@/types";

const PAYOUT_STATUS: Record<string, [string, BadgeTone]> = { REQUESTED: ["Chờ chuyển", "warning"], PAID: ["Đã chuyển", "success"], REJECTED: ["Từ chối", "danger"] };

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** US-42 (PRD-PAY-4/5) — tài khoản nhận tiền, yêu cầu rút (≥ 200.000đ, 1 yêu cầu mở), lịch sử, xuất CSV theo tháng. */
export default function PayoutPanel({ onChange }: { onChange?: () => void }) {
  const [data, setData] = useState<PayoutOverview | null>(null);
  const [form, setForm] = useState({ bankName: "", accountNumber: "", holderName: "" });
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const load = useCallback(() => paymentApi.payoutOverview().then(setData).catch((e) => setMsg({ error: errorMessage(e) })), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      setEditing(false);
      await load();
      onChange?.();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  };

  if (!data) return msg.error ? <Alert>{msg.error}</Alert> : null;
  const showForm = editing || !data.bankAccount;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Rút tiền" description={`Tối thiểu ${formatVnd(data.minimum)} mỗi lần, một yêu cầu đang mở tại một thời điểm.`} />
        <CardBody className="flex flex-col gap-5">
          <FlashAlerts flash={msg} />
          {data.openPayout ? (
            <Alert tone="info" title="Đang chờ chuyển khoản">
              {formatVnd(data.openPayout.amount)} tới {data.openPayout.bankName} {data.openPayout.accountNumberMasked}, yêu cầu lúc {formatDateTime(data.openPayout.requestedAt)}.
            </Alert>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="stat-label">Có thể rút</div>
                <div className="stat-value">{formatVnd(data.available)}</div>
              </div>
              <Button variant="primary" disabled={!data.canRequest}
                onClick={() => run(() => paymentApi.requestPayout(), "Đã gửi yêu cầu rút tiền. Quản trị viên sẽ chuyển khoản và báo cho bạn.")}>
                Rút {formatVnd(data.available)}
              </Button>
            </div>
          )}
          <hr className="divider" />
          <div className="flex flex-col gap-3">
            <div className="font-semibold">Tài khoản nhận tiền</div>
            {!data.bankAccount && <div className="text-small text-ink-muted">Thêm tài khoản ngân hàng để rút tiền.</div>}
            {!showForm && data.bankAccount && (
              <div className="flex items-center gap-3">
                <Landmark aria-hidden="true" className="size-5 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{data.bankAccount.bankName}</div>
                  <div className="text-small text-ink-muted"><span className="font-mono">{data.bankAccount.accountNumberMasked}</span> · {data.bankAccount.holderName}</div>
                </div>
                <Button size="sm" onClick={() => setEditing(true)}>Đổi</Button>
              </div>
            )}
            {showForm && (
              <form className="flex flex-col gap-3" onSubmit={(e) => {
                e.preventDefault();
                run(() => paymentApi.saveBankAccount(form), "Đã lưu tài khoản ngân hàng.");
              }}>
                <Field label="Ngân hàng" id="pp-bank">
                  <Input id="pp-bank" required placeholder="Vietcombank" value={form.bankName} maxLength={100}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                </Field>
                <div className="form-grid">
                  <Field label="Số tài khoản" id="pp-number">
                    <Input id="pp-number" required inputMode="numeric" className="font-mono" value={form.accountNumber} maxLength={40}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
                  </Field>
                  <Field label="Tên chủ tài khoản" id="pp-holder">
                    <Input id="pp-holder" required value={form.holderName} maxLength={100}
                      onChange={(e) => setForm({ ...form, holderName: e.target.value })} />
                  </Field>
                </div>
                <div className="form-actions">
                  <Button type="submit">Lưu tài khoản</Button>
                  {data.bankAccount && <Button variant="ghost" onClick={() => setEditing(false)}>Huỷ</Button>}
                  <span className="text-small text-ink-muted">Sau khi lưu, số tài khoản chỉ hiện 4 số cuối.</span>
                </div>
              </form>
            )}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Lịch sử rút tiền" />
        {data.history.length === 0 && <EmptyState title="Chưa có yêu cầu rút tiền">Các lần rút tiền và mã chuyển khoản sẽ hiện ở đây.</EmptyState>}
        {data.history.length > 0 && (
          <List>
            {data.history.map((p) => {
              const [label, tone] = PAYOUT_STATUS[p.status] ?? [p.status, "neutral"];
              return (
                <ListRow
                  key={p.id}
                  title={<span className="font-mono tabular">{formatVnd(p.amount)}</span>}
                  meta={<>{formatDateTime(p.requestedAt)}{p.reference ? <> · mã <span className="font-mono">{p.reference}</span></> : ""}{p.status === "REJECTED" && p.note ? ` · ${p.note}` : ""}</>}
                  trailing={<Badge tone={tone}>{label}</Badge>}
                />
              );
            })}
          </List>
        )}
        <div className="card-foot items-end justify-start">
          <Field label="Xuất thu nhập theo tháng (CSV)" id="pp-month">
            <div className="input-group">
              <Input id="pp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
              <Button icon={Download} disabled={!month}
                onClick={() => paymentApi.downloadEarningsCsv(month).catch((e) => setMsg({ error: errorMessage(e) }))}>Tải CSV</Button>
            </div>
          </Field>
        </div>
      </Card>
    </div>
  );
}
