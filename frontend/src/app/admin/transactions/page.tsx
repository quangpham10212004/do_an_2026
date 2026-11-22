"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Download, RefreshCw, Search } from "lucide-react";
import { Button, Card, EmptyState, FlashAlerts, Input, Loading, PageHeader, Pagination, Select, Table, Tabs, type Flash } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { TX_TYPE_LABELS, adminxApi, txTypeLabel, type AdminTxRow, type AdminTxType, type TxKpis } from "@/features/adminx/api";
import { downloadCsv } from "@/features/adminx/csv";
import { STATUS_LABELS, formatDateTime, formatVnd } from "@/lib/format";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import type { MentorReferral, TransactionStatus } from "@/types";

const TRANSACTION_STATUSES: TransactionStatus[] = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"];
type Range = "24h" | "7d" | "30d" | "all";
const RANGES: [Range, string, number][] = [["24h", "24 giờ", 1], ["7d", "7 ngày", 7], ["30d", "30 ngày", 30], ["all", "Tất cả", 0]];
const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("vi-VN")}`;

function Kpis({ k }: { k: TxKpis | null }) {
  if (!k) return null;
  return (
    <div className="adm-kpis mb-4">
      <div className="adm-kpi"><div className="l">Tiền đang giữ</div><div className="v">{formatVnd(k.held.amount)}</div><div className="h">{k.held.sessions} phiên chưa hoàn thành</div></div>
      <div className="adm-kpi"><div className="l">Nạp ví hôm nay</div><div className="v">{formatVnd(k.topupToday.amount)}</div><div className="h">MoMo {k.topupToday.momoPercent}% · VNPay {k.topupToday.vnpayPercent}%</div></div>
      <div className="adm-kpi"><div className="l">Giao dịch lỗi 24 giờ</div><div className="v">{k.failed24h}</div><div className="h">Cần đối soát</div></div>
      <div className="adm-kpi"><div className="l">Khuyến mãi đã cấp</div><div className="v">{formatVnd(k.promoGranted.amount)}</div><div className="h">{k.promoGranted.codes} mã giới thiệu</div></div>
    </div>
  );
}

function Transactions() {
  const [tab, setTab] = useState<"transactions" | "referrals">("transactions");
  const [status, setStatus] = useState<TransactionStatus | "">("");
  const [type, setType] = useState<AdminTxType | "">("");
  const [range, setRange] = useState<Range>("7d");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: AdminTxRow[]; totalItems: number; totalPages: number } | null>(null);
  const [kpis, setKpis] = useState<TxKpis | null>(null);
  const [overrides, setOverrides] = useState<Record<string, TransactionStatus>>({});
  const [busy, setBusy] = useState("");
  const [referrals, setReferrals] = useState<MentorReferral[] | null>(null);
  const [flash, setFlash] = useState<Flash>({});

  useEffect(() => {
    adminxApi.txKpis().then(setKpis).catch(() => setKpis(null));
  }, []);
  useEffect(() => {
    setData(null);
    adminxApi.transactions(status, page).then(setData).catch((e) => { setFlash({ error: errorMessage(e) }); setData({ items: [], totalItems: 0, totalPages: 0 }); });
  }, [status, page]);
  useEffect(() => {
    if (tab === "referrals" && !referrals) paymentApi.adminMentorReferrals().then(setReferrals).catch((e) => { setFlash({ error: errorMessage(e) }); setReferrals([]); });
  }, [tab, referrals]);

  const rows = useMemo(() => {
    const days = RANGES.find((r) => r[0] === range)?.[2] ?? 0;
    const since = days ? Date.now() - days * 864e5 : 0;
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter((r) =>
      (!type || r.type === type)
      && new Date(r.createdAt).getTime() >= since
      && (!needle || [r.code, r.id, r.userName, r.sessionId ?? ""].some((s) => s.toLowerCase().includes(needle))),
    ).map((r) => (overrides[r.id] ? { ...r, status: overrides[r.id] } : r));
  }, [data, type, range, q, overrides]);

  function exportCsv() {
    downloadCsv(`giao-dich-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Thời gian", "Mã", "Loại", "Người dùng", "Số tiền (đ)", "Trạng thái", "Mã phiên", "Tham chiếu", "Lý do lỗi"],
      rows.map((r) => [formatDateTime(r.createdAt), r.code, txTypeLabel(r), r.userName, r.amount, STATUS_LABELS[r.status] || r.status, r.sessionId, r.reference, r.failureReason]));
  }

  async function reconcile(r: AdminTxRow) {
    setBusy(r.id);
    setFlash({});
    try {
      const res = await adminxApi.reconcile(r);
      setOverrides((o) => ({ ...o, [r.id]: res.status }));
      setFlash({ ok: `Đã đối soát ${r.code}: ${STATUS_LABELS[res.status] || res.status}.` });
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader title="Giao dịch" description="Nạp ví, giữ tiền, hoàn tiền, chi trả và thưởng."
        actions={tab === "transactions" ? <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Xuất CSV</Button> : undefined} />
      <FlashAlerts flash={flash} className="mb-6" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "transactions", label: "Giao dịch" },
        { id: "referrals", label: "Giới thiệu" },
      ]} />
      {tab === "transactions" && (
        <>
          <Kpis k={kpis} />
          <div className="adm-filter">
            <div className="adm-search">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
              <Input type="search" aria-label="Tìm giao dịch" placeholder="Mã giao dịch, tên hoặc mã phiên" value={q} className="pl-9" onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select aria-label="Loại" value={type} className="w-auto min-w-[170px]" onChange={(e) => setType(e.target.value as AdminTxType | "")}>
              <option value="">Mọi loại</option>
              {(Object.keys(TX_TYPE_LABELS) as AdminTxType[]).map((t) => <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>)}
            </Select>
            <Select aria-label="Trạng thái" value={status} className="w-auto min-w-[170px]" onChange={(e) => { setStatus(e.target.value as TransactionStatus | ""); setPage(0); }}>
              <option value="">Mọi trạng thái</option>
              {TRANSACTION_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st] || st}</option>)}
            </Select>
            <Select aria-label="Thời gian" value={range} className="w-auto min-w-[130px]" onChange={(e) => setRange(e.target.value as Range)}>
              {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          {!data ? (flash.error ? null : <Loading />) : (
            <Card>
              {rows.length === 0 ? <EmptyState title="Không có giao dịch nào" /> : (
                <Table>
                  <thead><tr><th>Thời gian</th><th>Mã</th><th>Loại</th><th>Người dùng</th><th className="num">Số tiền</th><th>Trạng thái</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                        <td className="mono">{r.code}</td>
                        <td>{txTypeLabel(r)}</td>
                        <td>{r.userName}</td>
                        <td className={`num font-semibold${r.amount > 0 ? " adm-amount-pos" : ""}`}>{signed(r.amount)}</td>
                        <td>
                          <MentoringStatusBadge status={r.status} />
                          {r.failureReason && r.status === "FAILED" && <div className="text-small text-ink-muted">{r.failureReason}</div>}
                        </td>
                        <td className="actions">
                          {r.status === "PENDING" && (
                            <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy === r.id} onClick={() => reconcile(r)}>Đối soát</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <Pagination page={page} totalPages={data.totalPages} summary={`Hiển thị ${rows.length} / ${data.totalItems.toLocaleString("vi-VN")} giao dịch`} onChange={setPage} />
            </Card>
          )}
        </>
      )}
      {tab === "referrals" && (!referrals ? <Loading /> : (
        <Card>
          {referrals.length === 0 ? <EmptyState title="Chưa có lượt giới thiệu nào" /> : (
            <Table>
              <thead><tr><th>Thời gian</th><th>Mentor</th><th>Người giới thiệu</th><th>Người được giới thiệu</th><th>Trạng thái</th><th>Lý do / thưởng</th><th></th></tr></thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="mono">{r.mentorId.slice(0, 8)}</td>
                    <td className="mono">{r.ownerId.slice(0, 8)}</td>
                    <td className="mono">{r.refereeId.slice(0, 8)}</td>
                    <td><MentoringStatusBadge status={r.status} /></td>
                    <td className="text-small text-ink-muted">{r.rejectReason || (r.rewardAmount ? `+${r.rewardAmount}` : "—")}</td>
                    <td>
                      {r.status === "UNDER_REVIEW" && (
                        <span className="inline-flex gap-2">
                          <button className="btn btn-sm" onClick={() => paymentApi.decideMentorReferral(r.id, "APPROVE", "Đã xem xét, hợp lệ").then(() => setReferrals(null)).catch((e) => setFlash({ error: errorMessage(e) }))}>Duyệt</button>
                          <button className="btn btn-sm" onClick={() => paymentApi.decideMentorReferral(r.id, "REJECT", "Nghi ngờ lạm dụng").then(() => setReferrals(null)).catch((e) => setFlash({ error: errorMessage(e) }))}>Từ chối</button>
                        </span>
                      )}
                    </td>
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
