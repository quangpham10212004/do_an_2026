"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, StatusBadge } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { PayoutOverview } from "@/types";

const PAYOUT_STATUS: Record<string, string> = { REQUESTED: "Chờ chuyển", PAID: "Đã chuyển", REJECTED: "Từ chối" };

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
    <div className="grid grid-2" style={{ marginBottom: 16, alignItems: "start" }}>
      <div className="card stack">
        <h2>Rút tiền</h2>
        <Alert type="success">{msg.ok}</Alert>
        <Alert>{msg.error}</Alert>
        {data.openPayout ? (
          <Alert type="info">Đang chờ chuyển {formatVnd(data.openPayout.amount)} tới {data.openPayout.bankName} {data.openPayout.accountNumberMasked} (yêu cầu lúc {formatDateTime(data.openPayout.requestedAt)}).</Alert>
        ) : (
          <>
            <div>Có thể rút: <strong>{formatVnd(data.available)}</strong> <span className="small muted">· tối thiểu {formatVnd(data.minimum)}</span></div>
            <button className="btn" disabled={!data.canRequest}
              onClick={() => run(() => paymentApi.requestPayout(), "Đã gửi yêu cầu rút tiền. Quản trị viên sẽ chuyển khoản và báo cho bạn.")}>
              Rút {formatVnd(data.available)}
            </button>
            {!data.bankAccount && <div className="small muted">Hãy thêm tài khoản ngân hàng trước.</div>}
          </>
        )}
        <h3 style={{ marginTop: 12 }}>Tài khoản nhận tiền</h3>
        {!showForm && data.bankAccount && (
          <div className="row between">
            <span>{data.bankAccount.bankName} · {data.bankAccount.accountNumberMasked} · {data.bankAccount.holderName}</span>
            <button className="btn secondary sm" onClick={() => setEditing(true)}>Đổi</button>
          </div>
        )}
        {showForm && (
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            run(() => paymentApi.saveBankAccount(form), "Đã lưu tài khoản ngân hàng.");
          }}>
            <input required placeholder="Ngân hàng (vd. Vietcombank)" value={form.bankName} maxLength={100}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            <input required placeholder="Số tài khoản" inputMode="numeric" value={form.accountNumber} maxLength={40}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
            <input required placeholder="Tên chủ tài khoản" value={form.holderName} maxLength={100}
              onChange={(e) => setForm({ ...form, holderName: e.target.value })} />
            <div className="row">
              <button className="btn sm">Lưu</button>
              {data.bankAccount && <button type="button" className="btn secondary sm" onClick={() => setEditing(false)}>Thôi</button>}
            </div>
            <span className="small muted">Sau khi lưu, số tài khoản chỉ hiện 4 số cuối.</span>
          </form>
        )}
      </div>
      <div className="card stack">
        <h2>Lịch sử rút tiền</h2>
        {data.history.length === 0 && <div className="small muted">Chưa có yêu cầu nào.</div>}
        {data.history.map((p) => (
          <div key={p.id} className="row between small list-item">
            <span>{formatDateTime(p.requestedAt)} · {formatVnd(p.amount)}{p.reference ? ` · mã ${p.reference}` : ""}{p.status === "REJECTED" && p.note ? ` · ${p.note}` : ""}</span>
            <StatusBadge status={p.status === "PAID" ? "SUCCESS" : p.status === "REJECTED" ? "REJECTED" : "PENDING"} />
            <span className="muted">{PAYOUT_STATUS[p.status]}</span>
          </div>
        ))}
        <h3 style={{ marginTop: 12 }}>Xuất thu nhập (CSV)</h3>
        <div className="row">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn secondary sm" disabled={!month}
            onClick={() => paymentApi.downloadEarningsCsv(month).catch((e) => setMsg({ error: errorMessage(e) }))}>Tải CSV</button>
        </div>
      </div>
    </div>
  );
}
