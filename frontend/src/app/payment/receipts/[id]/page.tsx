"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ArrowLeft, Printer } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardBody, DescriptionList, Loading } from "@/components/ui";
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
    <div className="mx-auto flex max-w-[680px] flex-col gap-4">
      <div className="no-print flex justify-between gap-2">
        <ButtonLink href="/payment/transactions" variant="ghost" icon={ArrowLeft}>Giao dịch</ButtonLink>
        <Button icon={Printer} onClick={() => window.print()}>In hoặc lưu PDF</Button>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-title-1 font-semibold">Biên lai thanh toán</h1>
              <div className="text-ink-muted">MentorHub · Số <span className="font-mono">{r.receiptNumber}</span></div>
            </div>
            <span className="brand-mark" aria-hidden="true">M</span>
          </div>
          <DescriptionList items={[
            ["Mã giao dịch", <span key="id" className="font-mono text-small break-all">{r.transactionId}</span>],
            ["Thời gian thanh toán", formatDateTime(r.paidAt)],
            ["Người thanh toán", r.payerName],
            ["Mentor", r.mentorName],
            ["Phiên mentoring", r.sessionStart ? `${formatDateTime(r.sessionStart)} · ${r.durationMinutes} phút` : r.sessionId],
            ["Cổng thanh toán", `${r.provider}${r.providerReference ? ` · ${r.providerReference}` : ""}`],
          ]} />
          <hr className="divider" />
          <div className="flex flex-col gap-1.5 tabular">
            {([
              ["Số tiền", formatVnd(r.amount)],
              ["Phí nền tảng", formatVnd(r.fee)],
              ["Mentor nhận", formatVnd(r.mentorEarning)],
              ...(Number(r.refunded) > 0 ? [["Đã hoàn", formatVnd(r.refunded)]] : []),
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex justify-between gap-3"><span className="text-ink-muted">{l}</span><span className="font-mono">{v}</span></div>
            ))}
            <div className="mt-2 flex justify-between gap-3 border-t border-border pt-3 font-semibold">
              <span>Thực thu</span><span className="font-mono text-title-2">{formatVnd(r.netPaid)}</span>
            </div>
          </div>
        </CardBody>
      </Card>
      {r.refunds.map((f) => (
        <Card key={f.refundId}>
          <CardBody className="flex flex-col gap-4">
            <div>
              <h2 className="text-title-2 font-semibold">Biên lai hoàn tiền</h2>
              <div className="text-small text-ink-muted">Số <span className="font-mono">{f.receiptNumber}</span> · cho giao dịch <span className="font-mono">{r.receiptNumber}</span></div>
            </div>
            <DescriptionList items={[
              ["Thời gian", formatDateTime(f.createdAt)],
              ["Số tiền hoàn", <strong key="a" className="font-mono">{formatVnd(f.amount)}</strong>],
              ...(f.reason ? [["Lý do", f.reason] as [string, string]] : []),
            ]} />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export default function ReceiptPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <ReceiptView id={params.id} />}</RequireAuth>;
}
