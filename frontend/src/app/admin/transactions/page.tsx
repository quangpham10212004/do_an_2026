"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Card, EmptyState, Loading, PageHeader, Pagination, Select, Table, Tabs } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { STATUS_LABELS } from "@/lib/format";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { PageResponse, Referral, Transaction, TransactionStatus } from "@/types";

const TRANSACTION_STATUSES: TransactionStatus[] = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"];

function Transactions() {
  const [tab, setTab] = useState<"transactions" | "referrals">("transactions");
  const [status, setStatus] = useState<TransactionStatus | "">("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<Transaction> | null>(null);
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    paymentApi.adminTransactions(status, page).then(setData).catch((e) => setError(errorMessage(e)));
  }, [status, page]);
  useEffect(() => {
    if (tab === "referrals" && !referrals) paymentApi.adminReferrals().then(setReferrals).catch((e) => { setError(errorMessage(e)); setReferrals([]); });
  }, [tab, referrals]);

  return (
    <>
      <PageHeader title="Giao dịch" description="Giám sát thanh toán sandbox và các lượt giới thiệu." />
      <Alert className="mb-6">{error}</Alert>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "transactions", label: "Giao dịch" },
        { id: "referrals", label: "Giới thiệu" },
      ]} />
      {tab === "transactions" && (
        <>
          <div className="mb-4">
            <Select aria-label="Trạng thái" value={status} className="w-auto min-w-[200px]" onChange={(e) => { setStatus(e.target.value as TransactionStatus | ""); setPage(0); }}>
              <option value="">Mọi trạng thái</option>
              {TRANSACTION_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st] || st}</option>)}
            </Select>
          </div>
          {!data ? (error ? null : <Loading />) : (
            <Card>
              {data.items.length === 0 ? <EmptyState title="Không có giao dịch nào" /> : (
                <Table>
                  <thead><tr><th>Thời gian</th><th>Mã giao dịch</th><th>Phiên</th><th className="num">Số tiền</th><th>Trạng thái</th><th>Lý do</th><th>Tham chiếu</th></tr></thead>
                  <tbody>
                    {data.items.map((t) => (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                        <td className="mono">{t.id.slice(0, 8)}</td>
                        <td className="mono">{t.sessionId.slice(0, 8)}</td>
                        <td className="num">{formatMoney(t.amount)}</td>
                        <td><MentoringStatusBadge status={t.status} /></td>
                        <td className="text-small text-ink-muted">{t.failureReason || "—"}</td>
                        <td className="mono">{t.providerReference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <Pagination page={page} totalPages={data.totalPages} summary={`${data.totalItems} giao dịch`} onChange={setPage} />
            </Card>
          )}
        </>
      )}
      {tab === "referrals" && (!referrals ? <Loading /> : (
        <Card>
          {referrals.length === 0 ? <EmptyState title="Chưa có lượt giới thiệu nào" /> : (
            <Table>
              <thead><tr><th>Thời gian</th><th>Mã</th><th>Người giới thiệu</th><th>Người được giới thiệu</th><th>Trạng thái</th><th>Lý do từ chối</th></tr></thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="mono">{r.code}</td>
                    <td className="mono">{r.referrerId.slice(0, 8)}</td>
                    <td className="mono">{r.refereeId.slice(0, 8)}</td>
                    <td><MentoringStatusBadge status={r.status} /></td>
                    <td className="text-small text-ink-muted">{r.rejectReason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ))}
    </>
  );
}

export default function AdminTransactionsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Transactions />
    </RequireAuth>
  );
}
