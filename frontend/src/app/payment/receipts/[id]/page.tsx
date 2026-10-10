"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading } from "@/components/ui";
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
  const row = (label: string, value: React.ReactNode) => (
    <tr><th style={{ textAlign: "left", fontWeight: 600, width: "40%" }}>{label}</th><td>{value}</td></tr>
  );
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="row between no-print" style={{ marginBottom: 12 }}>
        <Link href="/payment/transactions" className="btn secondary sm">← Giao dịch</Link>
        <button className="btn sm" onClick={() => window.print()}>In / Lưu PDF</button>
      </div>
      <div className="card">
        <h1 style={{ marginBottom: 4 }}>Biên lai thanh toán</h1>
        <div className="muted">MentorHub · Số {r.receiptNumber}</div>
        <table style={{ width: "100%", marginTop: 16 }}>
          <tbody>
            {row("Mã giao dịch", r.transactionId)}
            {row("Thời gian thanh toán", formatDateTime(r.paidAt))}
            {row("Người thanh toán", r.payerName)}
            {row("Mentor", r.mentorName)}
            {row("Phiên mentoring", r.sessionStart ? `${formatDateTime(r.sessionStart)} · ${r.durationMinutes} phút` : r.sessionId)}
            {row("Số tiền", <strong>{formatVnd(r.amount)}</strong>)}
            {row("Phí nền tảng", formatVnd(r.fee))}
            {row("Mentor nhận", formatVnd(r.mentorEarning))}
            {row("Cổng thanh toán", `${r.provider}${r.providerReference ? ` · ${r.providerReference}` : ""}`)}
            {Number(r.refunded) > 0 && row("Đã hoàn", formatVnd(r.refunded))}
            {row("Thực thu", <strong>{formatVnd(r.netPaid)}</strong>)}
          </tbody>
        </table>
      </div>
      {r.refunds.map((f) => (
        <div key={f.refundId} className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginBottom: 4 }}>Biên lai hoàn tiền</h2>
          <div className="muted small">Số {f.receiptNumber} · cho giao dịch {r.receiptNumber}</div>
          <table style={{ width: "100%", marginTop: 8 }}>
            <tbody>
              {row("Thời gian", formatDateTime(f.createdAt))}
              {row("Số tiền hoàn", <strong>{formatVnd(f.amount)}</strong>)}
              {f.reason && row("Lý do", f.reason)}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function ReceiptPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <ReceiptView id={params.id} />}</RequireAuth>;
}
