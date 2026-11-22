"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Landmark } from "lucide-react";
import { Alert, Badge, Button, Field, FlashAlerts, Input, type BadgeTone } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatVnd } from "@/lib/format";
import type { PayoutOverview } from "@/types";

const STATUS: Record<string, [string, BadgeTone]> = { REQUESTED: ["Đang xử lý", "warning"], PAID: ["Đã chuyển", "success"], REJECTED: ["Từ chối", "danger"] };

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Cột phụ của Thu nhập: form rút tiền (số tiền + Rút tất cả), yêu cầu đang chờ, lịch sử, xuất CSV. */
export default function PayoutSide({ onChange }: { onChange?: () => void }) {
  const [data, setData] = useState<PayoutOverview | null>(null);
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState({ bankName: "", accountNumber: "", holderName: "" });
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const load = useCallback(() => paymentApi.payoutOverview().then((d) => { setData(d); setAmount(String(d.available)); }).catch((e) => setMsg({ error: errorMessage(e) })), []);
  useEffect(() => { load(); }, [load]);

  if (!data) return msg.error ? <Alert>{msg.error}</Alert> : null;
  const value = Number(amount.replace(/\D/g, "")) || 0;
  const showBank = editing || !data.bankAccount;
  const invalid = value < data.minimum || value > data.available;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg({});
    try { await fn(); setMsg({ ok }); setEditing(false); await load(); onChange?.(); }
    catch (e) { setMsg({ error: errorMessage(e) }); }
  };
  const submit = () => run(
    () => paymentApi.requestPayout(value === data.available ? undefined : value),
    "Đã gửi yêu cầu rút tiền. Quản trị viên sẽ chuyển khoản và báo cho bạn.",
  );

  return (
    <>
      <section className="ses-sec" aria-label="Rút tiền">
        <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><Landmark /></span>Rút tiền</h2></div>
        <div className="ses-sec-body flex flex-col gap-3">
          <p className="text-small text-ink-muted">Tối thiểu {formatVnd(data.minimum)} mỗi lần, một yêu cầu đang mở tại một thời điểm.</p>
          <FlashAlerts flash={msg} />
          {!data.openPayout && (
            <Field label="Số tiền rút" id="po-amount" hint={<>Tối đa {formatVnd(data.available)} · <button type="button" className="font-semibold underline" onClick={() => setAmount(String(data.available))}>Rút tất cả</button></>}>
              <Input id="po-amount" inputMode="numeric" className="tabular" value={value ? value.toLocaleString("vi-VN") : ""} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          {data.bankAccount && !showBank && (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 text-small"><b>{data.bankAccount.bankName}</b><div className="text-ink-muted"><span className="font-mono">{data.bankAccount.accountNumberMasked}</span> · {data.bankAccount.holderName}</div></div>
              <Button size="sm" onClick={() => setEditing(true)}>Đổi</Button>
            </div>
          )}
          {showBank && (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => paymentApi.saveBankAccount(bank), "Đã lưu tài khoản ngân hàng."); }}>
              <Field label="Ngân hàng" id="po-bank"><Input id="po-bank" required placeholder="Vietcombank" maxLength={100} value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
              <Field label="Số tài khoản" id="po-num"><Input id="po-num" required inputMode="numeric" className="font-mono" maxLength={40} value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} /></Field>
              <Field label="Tên chủ tài khoản" id="po-holder"><Input id="po-holder" required maxLength={100} value={bank.holderName} onChange={(e) => setBank({ ...bank, holderName: e.target.value })} /></Field>
              <div className="flex gap-2"><Button type="submit">Lưu tài khoản</Button>{data.bankAccount && <Button variant="ghost" onClick={() => setEditing(false)}>Huỷ</Button>}</div>
            </form>
          )}
          {!data.openPayout && (
            <Button variant="primary" block disabled={!data.canRequest || !data.bankAccount || invalid} onClick={submit}>
              Gửi yêu cầu rút {value ? formatVnd(value) : ""}
            </Button>
          )}
        </div>
      </section>

      {data.openPayout && (
        <div className="ses-pending-note" role="status">
          <i aria-hidden="true" />
          <div><b>Đang chờ chuyển khoản</b><p>Yêu cầu {formatVnd(data.openPayout.amount)} gửi {formatDateTime(data.openPayout.requestedAt)}. Thường xử lý trong 1–2 ngày làm việc.</p></div>
        </div>
      )}

      <section className="ses-sec" aria-label="Lịch sử rút tiền">
        <div className="ses-sec-head"><h2>Lịch sử rút tiền</h2></div>
        <div className="ses-sec-body">
          {data.history.length === 0 ? <p className="text-ink-muted">Chưa có yêu cầu rút tiền.</p> : (
            <ul className="ses-dl">
              {data.history.map((p) => {
                const [label, tone] = STATUS[p.status] ?? [p.status, "neutral" as BadgeTone];
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 last:border-0">
                    <div><b className="tabular">{formatVnd(p.amount)}</b><div className="text-small text-ink-muted">{formatDate(p.requestedAt)} · {p.reference ? `Mã CK ${p.reference}` : p.bankName}</div></div>
                    <Badge tone={tone}>{label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="ses-sec" aria-label="Xuất báo cáo">
        <div className="ses-sec-head"><h2>Xuất báo cáo</h2></div>
        <div className="ses-sec-body flex flex-wrap items-center gap-2">
          <Input type="month" aria-label="Tháng" className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button icon={Download} disabled={!month} onClick={() => paymentApi.downloadEarningsCsv(month).catch((e) => setMsg({ error: errorMessage(e) }))}>Tải CSV</Button>
        </div>
      </section>
    </>
  );
}
