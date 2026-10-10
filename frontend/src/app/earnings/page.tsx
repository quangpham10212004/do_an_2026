"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
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

  const reload = () => {
    paymentApi.earningSummary().then(setSummary).catch((e) => setError(errorMessage(e)));
    paymentApi.earnings().then(setRows).catch((e) => { setRows([]); setError(errorMessage(e)); });
  };
  useEffect(reload, []);

  if (rows === undefined) return <Loading />;
  const delay = summary?.releaseDelayHours ?? 48;

  return (
    <>
      <PageHead
        title="Thu nhập"
        subtitle={`Thu nhập sau phí nền tảng. Khoản của mỗi phiên được giải phóng ${delay} giờ sau khi phiên kết thúc (hoàn thành hoặc mentee vắng mặt) nếu không có tranh chấp.`}
      >
        <Link href="/payment/transactions" className="btn secondary sm">Xem giao dịch</Link>
      </PageHead>
      <Alert>{error}</Alert>
      {summary && (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="muted small">Chờ giải phóng</div>
            <div className="stat">{formatVnd(summary.pending)}</div>
            <div className="small muted">Phiên chưa kết thúc, chưa đủ {delay} giờ hoặc đang tranh chấp</div>
          </div>
          <div className="card">
            <div className="muted small">Có thể rút</div>
            <div className="stat">{formatVnd(summary.available)}</div>
            <div className="small muted">Đã giải phóng, chưa chi trả</div>
          </div>
          <div className="card">
            <div className="muted small">Đã chi trả</div>
            <div className="stat">{formatVnd(summary.paidOut)}</div>
            {Number(summary.reversed) > 0 && <div className="small muted">Đã thu hồi do hoàn tiền: {formatVnd(summary.reversed)}</div>}
          </div>
        </div>
      )}
      <PayoutPanel onChange={reload} />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <Empty>Chưa có thu nhập nào. Thu nhập được ghi khi mentee thanh toán phiên có phí.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Thanh toán lúc</th><th>Giá phiên</th><th>Mentor nhận</th><th>Chờ</th><th>Có thể rút</th><th>Thu hồi</th>
                <th>Phiên</th><th>Giải phóng</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.transactionId}>
                  <tr>
                    <td>{formatDateTime(r.createdAt)}</td>
                    <td>{formatVnd(r.amount)}</td>
                    <td>{formatVnd(r.mentorEarning)}</td>
                    <td>{formatVnd(r.pending)}</td>
                    <td><strong>{formatVnd(r.available)}</strong></td>
                    <td>{Number(r.reversed) > 0 ? formatVnd(r.reversed) : "—"}</td>
                    <td>{r.finalState ? <MentoringStatusBadge status={r.finalState} /> : <MentoringStatusBadge status={r.transactionStatus} />}</td>
                    <td className="small">{releaseNote(r, delay)}</td>
                    <td>
                      <button className="btn secondary sm" onClick={() => setOpen(open === r.transactionId ? null : r.transactionId)}>
                        {open === r.transactionId ? "Ẩn" : "Sổ"}
                      </button>
                    </td>
                  </tr>
                  {open === r.transactionId && (
                    <tr>
                      <td colSpan={9}>
                        {r.entries.map((e) => (
                          <div key={e.id} className="small">
                            {formatDateTime(e.createdAt)} · {LEDGER_TYPE_LABELS[e.type] || e.type}: {e.type === "REVERSAL" ? "−" : ""}{formatVnd(e.amount)}
                          </div>
                        ))}
                        <div className="small muted">Phiên {r.sessionId.slice(0, 8)} · <Link href="/mentoring/sessions">Xem phiên học</Link></div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function EarningsPage() {
  return <RequireAuth roles={["MENTOR"]}>{() => <Earnings />}</RequireAuth>;
}
