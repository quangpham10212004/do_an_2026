"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Button, Card, CardBody, CardHeader, EmptyState, Field, FlashAlerts, Input, Loading, PageHeader, Table, Alert, type Flash } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { TopupRefundRequest } from "@/types";

/** Bản chốt v2.0 §8 — admin: xử lý yêu cầu hoàn tiền nạp ngoại lệ, cấp tiền khuyến mãi. */
function AdminWallet() {
  const [requests, setRequests] = useState<TopupRefundRequest[] | null>(null);
  const [msg, setMsg] = useState<Flash>({});
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState(50_000);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    paymentApi.adminTopupRefunds("PENDING").then(setRequests).catch((e) => { setMsg({ error: errorMessage(e) }); setRequests([]); });
  }, []);
  useEffect(() => load(), [load]);

  async function decide(r: TopupRefundRequest, decision: "APPROVE" | "REJECT") {
    const why = window.prompt(decision === "APPROVE" ? "Lý do duyệt hoàn tiền (bắt buộc):" : "Lý do từ chối (bắt buộc):");
    if (!why || !why.trim()) return;
    try {
      await paymentApi.decideTopupRefund(r.id, decision, why.trim());
      setMsg({ ok: decision === "APPROVE" ? "Đã duyệt và hoàn tiền về nguồn thanh toán." : "Đã từ chối yêu cầu." });
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  async function grant(e: FormEvent) {
    e.preventDefault();
    try {
      await paymentApi.grantPromo(userId.trim(), amount, reason.trim());
      setMsg({ ok: `Đã cấp ${formatMoney(amount)} tiền khuyến mãi (hết hạn sau 12 tháng).` });
      setReason("");
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  return (
    <>
      <PageHeader title="Ví người dùng" description="Yêu cầu hoàn tiền nạp ngoài quy định (quá 7 ngày, quá số lần, vượt mức) và cấp khuyến mãi." />
      <FlashAlerts flash={msg} className="mb-6" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Yêu cầu hoàn tiền nạp chờ duyệt" />
          {!requests ? <Loading /> : requests.length === 0 ? <EmptyState title="Không có yêu cầu nào đang chờ" /> : (
            <Table>
              <thead><tr><th>Thời gian</th><th>Người dùng</th><th>Số tiền</th><th>Lý do</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="mono">{r.userId.slice(0, 8)}</td>
                    <td className="tabular">{formatMoney(r.amount)}</td>
                    <td className="text-small text-ink-muted">{r.userReason || "—"}</td>
                    <td><MentoringStatusBadge status={r.status === "DONE" ? "SUCCESS" : r.status} /></td>
                    <td className="whitespace-nowrap">
                      <Button size="sm" variant="primary" onClick={() => decide(r, "APPROVE")}>Duyệt</Button>{" "}
                      <Button size="sm" onClick={() => decide(r, "REJECT")}>Từ chối</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <form onSubmit={grant}>
          <Card>
            <CardHeader title="Cấp tiền khuyến mãi" />
            <CardBody className="flex flex-col gap-4">
              <Alert tone="info">Khuyến mãi chỉ dùng trong nền tảng, hết hạn sau 12 tháng và không hoàn ra nguồn nạp.</Alert>
              <Field label="ID người dùng" id="promo-user"><Input id="promo-user" required value={userId} onChange={(e) => setUserId(e.target.value)} className="font-mono" /></Field>
              <Field label="Số tiền (đ)" id="promo-amount"><Input id="promo-amount" type="number" required min={10_000} step={10_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
              <Field label="Lý do" id="promo-reason"><Input id="promo-reason" required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <div><Button type="submit" variant="primary">Cấp khuyến mãi</Button></div>
            </CardBody>
          </Card>
        </form>
      </div>
    </>
  );
}

export default function AdminWalletPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminWallet />
    </RequireAuth>
  );
}
