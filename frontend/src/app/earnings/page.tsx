"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Wallet } from "lucide-react";
import { Alert, Button, ButtonLink, Card, EmptyState, Loading, PageHeader, Stat, Stats, Table, Tabs } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import PayoutPanel from "@/features/payment/PayoutPanel";
import { LEDGER_TYPE_LABELS, paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { EarningRow, EarningSummary } from "@/types";

/** Mô tả trạng thái giải phóng của 1 phiên. */
function releaseNote(r: EarningRow, delayHours: number): string {
  if (r.transactionStatus === "ON_HOLD") return "Đang tạm giữ do tranh chấp";
  if (Number(r.pending) === 0 && Number(r.available) === 0 && Number(r.reversed) > 0) return "Đã hoàn tiền cho mentee";
  if (r.releasedAt && Number(r.pending) === 0) return `Giải phóng lúc ${formatDateTime(r.releasedAt)}`;
  if (r.releaseAt) return `Dự kiến giải phóng ${formatDateTime(r.releaseAt)}`;
  return `Chờ phiên kết thúc (+${delayHours} giờ)`;
}

/** US-25 — thu nhập của mentor: tổng chờ giải phóng / có thể rút / đã chi trả và chi tiết từng phiên. */
function Earnings() {
  const [summary, setSummary] = useState<EarningSummary | null>(null);
  const [rows, setRows] = useState<EarningRow[] | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"sessions" | "payout">("sessions");

  const reload = () => {
    paymentApi.earningSummary().then(setSummary).catch((e) => setError(errorMessage(e)));
    paymentApi.earnings().then(setRows).catch((e) => { setRows([]); setError(errorMessage(e)); });
  };
  useEffect(reload, []);

  if (rows === undefined) return <Loading />;
  const delay = summary?.releaseDelayHours ?? 48;

  return (
    <>
      <PageHeader
        title="Thu nhập"
        description={`Thu nhập sau phí nền tảng. Khoản của mỗi phiên được giải phóng ${delay} giờ sau khi phiên kết thúc nếu không có tranh chấp.`}
        actions={<ButtonLink href="/payment/transactions">Xem giao dịch</ButtonLink>}
      />
      <Alert className="mb-6">{error}</Alert>
      {summary && (
        <div className="mb-6">
          <Stats>
            <Stat label="Chờ giải phóng" value={formatVnd(summary.pending)} hint={`Chưa đủ ${delay} giờ sau phiên hoặc đang tranh chấp`} />
            <Stat label="Có thể rút" value={formatVnd(summary.available)} hint="Đã giải phóng, chưa chi trả" />
            <Stat label="Đã chi trả" value={formatVnd(summary.paidOut)}
              hint={Number(summary.reversed) > 0 ? `Đã thu hồi do hoàn tiền: ${formatVnd(summary.reversed)}` : undefined} />
          </Stats>
        </div>
      )}
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "sessions", label: "Theo phiên", count: rows.length },
        { id: "payout", label: "Rút tiền" },
      ]} />
      {tab === "payout" && <PayoutPanel onChange={reload} />}
      {tab === "sessions" && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title="Chưa có thu nhập nào">Thu nhập được ghi khi mentee thanh toán phiên có phí.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Thanh toán lúc</th><th className="num">Giá phiên</th><th className="num">Mentor nhận</th><th className="num">Chờ</th>
                  <th className="num">Có thể rút</th><th className="num">Thu hồi</th><th>Phiên</th><th>Giải phóng</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.transactionId}>
                    <tr>
                      <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="num">{formatVnd(r.amount)}</td>
                      <td className="num">{formatVnd(r.mentorEarning)}</td>
                      <td className="num">{formatVnd(r.pending)}</td>
                      <td className="num font-semibold">{formatVnd(r.available)}</td>
                      <td className="num">{Number(r.reversed) > 0 ? formatVnd(r.reversed) : "—"}</td>
                      <td><MentoringStatusBadge status={r.finalState || r.transactionStatus} /></td>
                      <td className="min-w-[180px] text-small text-ink-muted">{releaseNote(r, delay)}</td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" aria-expanded={open === r.transactionId} onClick={() => setOpen(open === r.transactionId ? null : r.transactionId)}>
                          {open === r.transactionId ? "Ẩn sổ" : "Sổ cái"}
                        </Button>
                      </td>
                    </tr>
                    {open === r.transactionId && (
                      <tr>
                        <td colSpan={9} className="bg-surface-sunken">
                          <div className="flex flex-col gap-1 text-small">
                            {r.entries.map((e) => (
                              <div key={e.id} className="flex flex-wrap gap-x-3">
                                <span className="text-ink-muted tabular">{formatDateTime(e.createdAt)}</span>
                                <span>{LEDGER_TYPE_LABELS[e.type] || e.type}</span>
                                <span className="font-mono tabular">{e.type === "REVERSAL" ? "−" : ""}{formatVnd(e.amount)}</span>
                              </div>
                            ))}
                            <div className="text-ink-muted">Phiên <span className="font-mono">{r.sessionId.slice(0, 8)}</span> · <Link href="/mentoring/sessions">Xem phiên học</Link></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

export default function EarningsPage() {
  return <RequireAuth roles={["MENTOR"]}>{() => <Earnings />}</RequireAuth>;
}
