"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ArrowLeft, Printer } from "lucide-react";
import { Alert, Button, ButtonLink, Loading } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { Receipt } from "@/types";

/** US-42 (PRD-PAY-6) — biên lai giao dịch (kèm biên lai hoàn tiền); "In / Lưu PDF" dùng hộp thoại in của trình duyệt. */
function ReceiptView({ id }: { id: string }) {
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    paymentApi.receipt(id).then(setR).catch((e) => setError(errorMessage(e)));
  }, [id]);
  if (!r) return error ? <Alert>{error}</Alert> : <Loading />;
  return (
    <div className="fl-page flex flex-col gap-4">
      <div className="no-print mx-auto flex w-full max-w-[640px] justify-between gap-2">
        <ButtonLink href="/payment/transactions" variant="ghost" icon={ArrowLeft}>Giao dịch</ButtonLink>
        <Button icon={Printer} onClick={() => window.print()}>In hoặc lưu PDF</Button>
      </div>
      <section className="fl-receipt" aria-label="Biên lai thanh toán">
        <div className="fl-receipt-top">
          <div className="fl-brand"><span aria-hidden="true">M</span>MentorHub</div>
          <div className="text-right text-[13px] text-ink-muted">Biên lai thanh toán<br /><b className="font-mono text-ink">#{r.receiptNumber}</b></div>
        </div>
        <dl className="fl-dl">
          <div><dt>Người thanh toán</dt><dd>{r.payerName}</dd></div>
          <div><dt>Mentor</dt><dd>{r.mentorName}</dd></div>
          <div><dt>Phiên</dt><dd>{r.sessionStart ? `${formatDateTime(r.sessionStart)} · ${r.durationMinutes} phút` : r.sessionId}</dd></div>
          <div><dt>Thời gian thanh toán</dt><dd>{formatDateTime(r.paidAt)}</dd></div>
          <div><dt>Hình thức</dt><dd>{r.provider === "WALLET" ? "Tạm giữ từ ví" : r.provider}{r.providerReference ? ` · ${r.providerReference}` : ""}</dd></div>
          <div><dt>Mã giao dịch</dt><dd className="font-mono text-small break-all">{r.transactionId}</dd></div>
          <div><dt>Số tiền</dt><dd className="font-mono tabular">{formatVnd(r.amount)}</dd></div>
          <div><dt>Phí nền tảng</dt><dd className="font-mono tabular">{formatVnd(r.fee)}</dd></div>
          <div><dt>Mentor nhận</dt><dd className="font-mono tabular">{formatVnd(r.mentorEarning)}</dd></div>
          {Number(r.refunded) > 0 && <div><dt>Đã hoàn</dt><dd className="font-mono tabular">{formatVnd(r.refunded)}</dd></div>}
          <div className="fl-grand"><dt>Thực thu</dt><dd className="font-mono tabular">{formatVnd(r.netPaid)}</dd></div>
        </dl>
        <Button className="no-print mt-6" icon={Printer} onClick={() => window.print()}>In hoặc lưu PDF</Button>
      </section>
      {r.refunds.map((f) => (
        <section key={f.refundId} className="fl-receipt" aria-label="Biên lai hoàn tiền">
          <h2 className="text-title-2 font-semibold">Biên lai hoàn tiền</h2>
          <div className="text-small text-ink-muted">Số <span className="font-mono">{f.receiptNumber}</span> · cho giao dịch <span className="font-mono">{r.receiptNumber}</span></div>
          <dl className="fl-dl" style={{ marginTop: 16 }}>
            <div><dt>Thời gian</dt><dd>{formatDateTime(f.createdAt)}</dd></div>
            <div><dt>Số tiền hoàn</dt><dd className="font-mono tabular"><strong>{formatVnd(f.amount)}</strong></dd></div>
            {f.reason && <div><dt>Lý do</dt><dd>{f.reason}</dd></div>}
          </dl>
        </section>
      ))}
    </div>
  );
}

export default function ReceiptPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <ReceiptView id={params.id} />}</RequireAuth>;
}
