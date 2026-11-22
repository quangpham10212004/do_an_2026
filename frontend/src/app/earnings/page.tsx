"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { BarChart3, ReceiptText, Wallet } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, Chip, Chips, EmptyState, Loading, PageHeader, Select, Stat, Stats, Table, type BadgeTone } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import PayoutSide from "@/features/sesx/PayoutSide";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { LEDGER_TYPE_LABELS, paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { EarningRow, EarningSummary, MentoringSession } from "@/types";

/** Mô tả trạng thái giải phóng của 1 phiên. */
function releaseNote(r: EarningRow, delayHours: number): string {
  if (r.transactionStatus === "ON_HOLD") return "Đang tạm giữ do tranh chấp";
  if (Number(r.pending) === 0 && Number(r.available) === 0 && Number(r.reversed) > 0) return "Đã hoàn tiền cho mentee";
  if (r.releasedAt && Number(r.pending) === 0) return `Giải phóng lúc ${formatDateTime(r.releasedAt)}`;
  if (r.releaseAt) return `Dự kiến giải phóng ${formatDateTime(r.releaseAt)}`;
  return `Chờ phiên kết thúc (+${delayHours} giờ)`;
}

type RowFilter = "all" | "pending" | "available" | "paid" | "hold";
const ROW_FILTERS: [RowFilter, string][] = [["all", "Tất cả"], ["pending", "Chờ giải phóng"], ["available", "Có thể rút"], ["paid", "Đã chi trả"], ["hold", "Đang tranh chấp"]];

/** Nhóm trạng thái hiển thị của 1 dòng thu nhập (suy ra từ số dư từng phần). */
function rowGroup(r: EarningRow): { key: Exclude<RowFilter, "all"> | "refund"; label: string; tone: BadgeTone } {
  if (r.transactionStatus === "ON_HOLD") return { key: "hold", label: "Đang tranh chấp", tone: "danger" };
  if (Number(r.pending) > 0) return { key: "pending", label: "Chờ giải phóng", tone: "warning" };
  if (Number(r.available) > 0) return { key: "available", label: "Có thể rút", tone: "accent" };
  if (Number(r.paidOut) > 0) return { key: "paid", label: "Đã chi trả", tone: "success" };
  return { key: "refund", label: "Đã hoàn tiền", tone: "neutral" };
}

/** Doanh thu theo tháng (sau phí nền tảng) của 6 tháng gần nhất, tính từ các dòng thu nhập đã có — không cần API riêng. */
const PERIODS = [3, 6, 12] as const;
const PAGE_SIZE = 6;

function monthlySeries(rows: EarningRow[], n: number) {
  const now = new Date();
  const months = Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `T${d.getMonth() + 1}`, total: 0, count: 0 };
  });
  for (const r of rows) {
    if (Number(r.reversed) > 0 && Number(r.pending) === 0 && Number(r.available) === 0 && Number(r.paidOut) === 0) continue;
    const d = new Date(r.createdAt);
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) {
      m.total += Number(r.mentorEarning);
      m.count += 1;
    }
  }
  return months;
}

function shortVnd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}tr`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

/** US-25 — thu nhập của mentor: tổng chờ giải phóng / có thể rút / đã chi trả và chi tiết từng phiên. */
function Earnings() {
  const [summary, setSummary] = useState<EarningSummary | null>(null);
  const [rows, setRows] = useState<EarningRow[] | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [period, setPeriod] = useState<number>(6);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sessions, setSessions] = useState<Record<string, MentoringSession>>({});

  useEffect(() => {
    mentoringApi.sessions().then((list) => setSessions(Object.fromEntries(list.map((x) => [x.id, x])))).catch(() => {});
  }, []);

  const reload = () => {
    paymentApi.earningSummary().then(setSummary).catch((e) => setError(errorMessage(e)));
    paymentApi.earnings().then(setRows).catch((e) => { setRows([]); setError(errorMessage(e)); });
  };
  useEffect(reload, []);

  if (rows === undefined) return <Loading />;
  const delay = summary?.releaseDelayHours ?? 48;
  const series = monthlySeries(rows, period);
  const thisMonth = series[series.length - 1];
  const lastMonth = series[series.length - 2];
  const delta = lastMonth.total > 0 ? Math.round(((thisMonth.total - lastMonth.total) / lastMonth.total) * 100) : null;
  const maxTotal = Math.max(1, ...series.map((m) => m.total));
  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth() - (period - 1), 1).getTime();
  const inPeriod = rows.filter((r) => new Date(r.createdAt).getTime() >= periodStart);
  const filtered = inPeriod.filter((r) => rowFilter === "all" || rowGroup(r).key === rowFilter);
  const shown = filtered.slice(0, visible);

  return (
    <>
      <PageHeader
        title="Thu nhập"
        description={`Thu nhập sau phí nền tảng. Khoản của mỗi phiên được giải phóng ${delay} giờ sau khi phiên kết thúc nếu không có tranh chấp.`}
        actions={<div className="flex flex-wrap items-end gap-3">
          <label className="ses-period">Kỳ xem
            <Select className="w-auto" value={period} onChange={(e) => { setPeriod(Number(e.target.value)); setVisible(PAGE_SIZE); }}>
              {PERIODS.map((p) => <option key={p} value={p}>{p} tháng gần nhất</option>)}
            </Select>
          </label>
          <ButtonLink href="/payment/transactions" icon={ReceiptText}>Xem giao dịch</ButtonLink>
        </div>}
      />
      <Alert className="mb-6">{error}</Alert>
      {summary && (
        <div className="mb-6">
          <Stats>
            <Stat label="Chờ giải phóng" value={formatVnd(summary.pending)} hint={`Chưa đủ ${delay} giờ sau phiên hoặc đang tranh chấp`} />
            <Stat label="Có thể rút" value={formatVnd(summary.available)} hint="Đã giải phóng, chưa chi trả" />
            <Stat label="Đã chi trả" value={formatVnd(summary.paidOut)}
              hint={Number(summary.reversed) > 0 ? `Từ đầu đến nay · đã thu hồi do hoàn tiền ${formatVnd(summary.reversed)}` : "Từ đầu đến nay"} />
            <Stat label="Tháng này" value={formatVnd(thisMonth.total)}
              hint={`${delta === null ? "Chưa có dữ liệu tháng trước" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% so với tháng trước`} · ${thisMonth.count} phiên`} />
          </Stats>
        </div>
      )}
      <div className="ses-grid">
      <div className="ses-main">
      <section className="ses-sec" aria-label="Doanh thu theo tháng">
        <div className="ses-sec-head">
          <h2><span className="ses-ico" aria-hidden="true"><BarChart3 /></span>Doanh thu theo tháng</h2>
          <span className="text-small text-ink-muted">Sau phí nền tảng 10%</span>
        </div>
        <div className="ses-sec-body">
          <div className="ses-chart" role="img"
            aria-label={`Biểu đồ cột doanh thu ${period} tháng: ${series.map((m) => `${m.label} ${formatVnd(m.total)}`).join(", ")}`}>
            {series.map((m, i) => (
              <div key={m.key} className="ses-chart-col" data-current={i === series.length - 1}>
                <span className="ses-chart-val">{m.total > 0 ? shortVnd(m.total) : "—"}</span>
                <div className="ses-chart-bar" style={{ height: `${Math.max(2, (m.total / maxTotal) * 80)}%` }} />
              </div>
            ))}
          </div>
          <div className="ses-chart-axis" aria-hidden="true">{series.map((m) => <span key={m.key}>{m.label}</span>)}</div>
        </div>
      </section>
      <Card>
          <CardHeader title="Thu nhập theo phiên" description={`${inPeriod.length} phiên trong ${period} tháng`} />
          {rows.length > 0 && (
            <Chips className="border-b border-border px-5 py-3">
              {ROW_FILTERS.map(([k, l]) => <Chip key={k} selected={rowFilter === k} onClick={() => { setRowFilter(k); setVisible(PAGE_SIZE); }}>{l}</Chip>)}
            </Chips>
          )}
          {rows.length > 0 && filtered.length === 0 ? (
            <EmptyState icon={Wallet} title="Không có phiên nào ở nhóm này">Chọn bộ lọc khác để xem thu nhập.</EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState icon={Wallet} title="Chưa có thu nhập nào">Thu nhập được ghi khi mentee thanh toán phiên có phí.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Phiên</th><th>Thanh toán lúc</th><th className="num">Học phí</th><th className="num">Bạn nhận</th><th className="num">Chờ</th>
                  <th className="num">Có thể rút</th><th className="num">Thu hồi</th><th>Trạng thái</th><th>Giải phóng</th><th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.transactionId}>
                    <tr>
                      <td className="min-w-[160px]">
                        {sessions[r.sessionId] ? (<><b>{sessions[r.sessionId].menteeName}</b><div className="text-small text-ink-muted">{sessions[r.sessionId].topic || "Phiên mentoring"} · {sessions[r.sessionId].durationMinutes} phút</div></>) : <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="num">{formatVnd(r.amount)}</td>
                      <td className="num">{formatVnd(r.mentorEarning)}</td>
                      <td className="num">{formatVnd(r.pending)}</td>
                      <td className="num font-semibold">{formatVnd(r.available)}</td>
                      <td className="num">{Number(r.reversed) > 0 ? formatVnd(r.reversed) : "—"}</td>
                      <td><Badge tone={rowGroup(r).tone}>{rowGroup(r).label}</Badge> <MentoringStatusBadge status={r.finalState || r.transactionStatus} /></td>
                      <td className="min-w-[180px] text-small text-ink-muted">{releaseNote(r, delay)}</td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" aria-expanded={open === r.transactionId} onClick={() => setOpen(open === r.transactionId ? null : r.transactionId)}>
                          {open === r.transactionId ? "Ẩn sổ" : "Sổ cái"}
                        </Button>
                      </td>
                    </tr>
                    {open === r.transactionId && (
                      <tr>
                        <td colSpan={10} className="bg-surface-sunken">
                          <div className="flex flex-col gap-1 text-small">
                            {r.entries.map((e) => (
                              <div key={e.id} className="flex flex-wrap gap-x-3">
                                <span className="text-ink-muted tabular">{formatDateTime(e.createdAt)}</span>
                                <span>{LEDGER_TYPE_LABELS[e.type] || e.type}</span>
                                <span className="font-mono tabular">{e.type === "REVERSAL" ? "−" : ""}{formatVnd(e.amount)}</span>
                              </div>
                            ))}
                            <div className="text-ink-muted">Phiên <span className="font-mono">{r.sessionId.slice(0, 8)}</span> · <Link href={`/mentoring/sessions/${r.sessionId}`}>Xem phiên học</Link></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </Table>
          )}
          {filtered.length > 0 && (
            <div className="ses-more">
              <span>Hiển thị {shown.length} / {filtered.length} phiên</span>
              {shown.length < filtered.length && <Button size="sm" variant="ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>Xem thêm →</Button>}
            </div>
          )}
      </Card>
      </div>
      <aside className="ses-side" aria-label="Rút tiền">
        <PayoutSide onChange={reload} />
      </aside>
      </div>
    </>
  );
}

export default function EarningsPage() {
  return <RequireAuth roles={["MENTOR"]}>{() => <Earnings />}</RequireAuth>;
}
