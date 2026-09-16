"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Loading, PageHead, StatusBadge } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";

function Transactions() {
  const [tab, setTab] = useState("transactions");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [referrals, setReferrals] = useState(null);

  useEffect(() => {
    setData(null);
    paymentApi.adminTransactions(status, page).then(setData);
  }, [status, page]);
  useEffect(() => {
    if (tab === "referrals" && !referrals) paymentApi.adminReferrals().then(setReferrals);
  }, [tab, referrals]);

  return (
    <>
      <PageHead title="Giám sát giao dịch & referral" />
      <div className="tabs">
        <button className={tab === "transactions" ? "active" : ""} onClick={() => setTab("transactions")}>Giao dịch</button>
        <button className={tab === "referrals" ? "active" : ""} onClick={() => setTab("referrals")}>Referral</button>
      </div>
      {tab === "transactions" && (
        <>
          <div className="row" style={{ marginBottom: "1rem" }}>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} style={{ maxWidth: 220 }}>
              <option value="">Mọi trạng thái</option>
              {["PENDING", "SUCCESS", "FAILED", "REFUNDED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {!data ? <Loading /> : (
            <div className="card table-wrap">
              <table>
                <thead><tr><th>Thời gian</th><th>Mã giao dịch</th><th>Phiên</th><th>Số tiền</th><th>Trạng thái</th><th>Lý do</th><th>Tham chiếu</th></tr></thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDateTime(t.createdAt)}</td>
                      <td className="small">{t.id.slice(0, 8)}</td>
                      <td className="small">{t.sessionId.slice(0, 8)}</td>
                      <td>{formatMoney(t.amount)}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="small">{t.failureReason || "—"}</td>
                      <td className="small">{t.providerReference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row between" style={{ marginTop: "0.75rem" }}>
                <span className="muted small">{data.totalItems} giao dịch</span>
                <div className="row">
                  <button className="btn secondary sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button>
                  <button className="btn secondary sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Sau</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {tab === "referrals" && (!referrals ? <Loading /> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Thời gian</th><th>Mã</th><th>Người giới thiệu</th><th>Người được giới thiệu</th><th>Trạng thái</th><th>Lý do từ chối</th></tr></thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td>{r.code}</td>
                  <td className="small">{r.referrerId.slice(0, 8)}</td>
                  <td className="small">{r.refereeId.slice(0, 8)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="small">{r.rejectReason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
