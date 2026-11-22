"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Wallet } from "lucide-react";
import { Alert, Badge, Loading } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { EarningRow, MentoringSession, Transaction } from "@/types";

/** Khoảng chờ giải phóng mặc định khi mentee chưa đọc được cấu hình (mentor lấy từ earnings). */
const DEFAULT_RELEASE_HOURS = 48;

type StepState = "done" | "now" | "todo" | "bad";
interface Step { title: string; time: string; note: string; state: StepState }

/** Dựng các mốc của dòng tiền từ giao dịch của phiên và (với mentor) dòng thu nhập. */
function buildSteps(s: MentoringSession, tx: Transaction | null, row: EarningRow | null): Step[] {
  const held = tx?.status === "ON_HOLD";
  const refunded = tx ? tx.refundedAmount > 0 : false;
  const completed = s.status === "COMPLETED";
  const releaseAt = row?.releaseAt ?? new Date(new Date(s.endsAt).getTime() + DEFAULT_RELEASE_HOURS * 3600_000).toISOString();
  const released = row ? row.available > 0 || row.paidOut > 0 || !!row.releasedAt : false;
  const paidOut = row ? row.paidOut > 0 : false;
  const steps: Step[] = [
    { title: "Đã giữ tiền", time: tx ? formatDateTime(tx.createdAt) : "—", note: tx ? `Mentee thanh toán ${formatVnd(tx.amount)}` : "Chưa có thanh toán", state: tx ? "done" : "now" },
    { title: "Phiên hoàn thành", time: completed ? formatDateTime(s.endsAt) : "Chưa hoàn thành", note: completed ? "Hai bên đã xác nhận" : "Tiền chỉ được giải phóng sau khi phiên hoàn thành", state: completed ? "done" : tx ? "now" : "todo" },
    { title: "Chờ giải phóng", time: completed ? (released ? "Đã hết thời gian chờ" : `Dự kiến ${formatDateTime(releaseAt)}`) : "—", note: held ? "Đang tạm giữ do tranh chấp" : "Khoảng chờ để mentee khiếu nại", state: held ? "bad" : released ? "done" : completed ? "now" : "todo" },
    { title: "Có thể rút", time: released && row?.releasedAt ? formatDateTime(row.releasedAt) : completed ? `${formatDateTime(releaseAt)} (dự kiến)` : "—", note: "Tiền vào số dư của mentor", state: released ? "done" : "todo" },
    { title: "Đã chi trả", time: paidOut ? "Đã rút về ngân hàng" : "Khi mentor rút về ngân hàng", note: "", state: paidOut ? "done" : "todo" },
  ];
  if (refunded && tx) {
    steps.splice(2, 0, { title: "Hoàn tiền", time: tx.refunds[0] ? formatDateTime(tx.refunds[0].createdAt) : "—", note: `Đã hoàn ${formatVnd(tx.refundedAmount)} cho mentee`, state: "bad" });
  }
  return steps;
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="ses-steps" aria-label="Các mốc dòng tiền">
      {steps.map((st, i) => (
        <li key={st.title} className="ses-step" data-state={st.state} aria-current={st.state === "now" ? "step" : undefined}>
          <span className="ses-step-dot" aria-hidden="true">{st.state === "done" ? <Check /> : i + 1}</span>
          <div>
            <b>{st.title}</b>
            <div className="t">{st.time}</div>
            {st.note && <div className="t">{st.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Tiền của một phiên (board SesMoney): tạm giữ, giải phóng, hoàn tiền, phí. Dùng API payment có sẵn:
 * GET /api/payment/sessions/{id}/transactions (cả hai bên) và GET /api/payment/earnings (mentor).
 */
export default function SessionMoney({ session, isMentor, compact }: { session: MentoringSession; isMentor: boolean; compact?: boolean }) {
  const [tx, setTx] = useState<Transaction | null | undefined>(undefined);
  const [row, setRow] = useState<EarningRow | null>(null);
  const [error, setError] = useState("");
  const free = Number(session.price) <= 0;

  useEffect(() => {
    if (free) { setTx(null); return; }
    let live = true;
    paymentApi.sessionTransactions(session.id)
      .then((all) => live && setTx(all.find((t) => t.kind === "SESSION") ?? all[0] ?? null))
      .catch(() => { if (live) { setTx(null); setError("Không tải được giao dịch của phiên."); } });
    if (isMentor) paymentApi.earnings().then((r) => live && setRow(r.find((x) => x.sessionId === session.id) ?? null)).catch(() => {});
    return () => { live = false; };
  }, [session.id, isMentor, free]);

  if (free) return <Alert tone="info">Phiên này miễn phí nên không có dòng tiền.</Alert>;
  if (tx === undefined) return <Loading />;

  const held = tx?.status === "ON_HOLD";
  const steps = buildSteps(session, tx, row);
  const gross = tx?.amount ?? session.price;
  const fee = tx?.fee ?? 0;
  const net = tx?.mentorEarning ?? gross - fee;
  const promo = tx?.paidPromo ?? 0;

  if (compact) {
    return (
      <div className="ses-hold" aria-label="Học phí của phiên">
        <div className="flex items-center gap-2 font-semibold"><Wallet className="size-[18px]" aria-hidden="true" />{isMentor ? "Thu nhập dự kiến" : held ? "Học phí đang bị tạm giữ" : "Học phí đang được giữ"}</div>
        <div className="amt">{formatVnd(isMentor ? net : gross)}</div>
        <p className="mt-1 text-small">{isMentor ? `Sau phí nền tảng ${formatVnd(fee)}. ` : ""}Chỉ chuyển cho mentor sau khi phiên hoàn thành.</p>
        <Link href={`/mentoring/sessions/${session.id}/money`} className="mt-1 inline-flex min-h-[44px] items-center text-small font-semibold">Xem dòng tiền của phiên</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="warning">{error}</Alert>}
      <section className="ses-sec" aria-label="Dòng tiền">
        <div className="ses-sec-head"><h2>Các mốc dòng tiền</h2>{held && <Badge tone="danger">Đang tạm giữ</Badge>}</div>
        <div className="ses-sec-body"><Timeline steps={steps} /></div>
      </section>
      <section className="ses-sec" aria-label={isMentor ? "Thu nhập từ phiên này" : "Học phí phiên này"}>
        <div className="ses-sec-head"><h2>{isMentor ? "Thu nhập từ phiên này" : "Học phí phiên này"}</h2></div>
        <div className="ses-sec-body flex flex-col gap-3">
          {isMentor ? (
            <dl className="ses-dl">
              <div><dt>Học phí mentee trả</dt><dd>{formatVnd(gross)}</dd></div>
              <div><dt>Phí nền tảng{tx ? ` (${Math.round(tx.feeRate * 10000) / 100}%)` : ""}</dt><dd>−{formatVnd(fee)}</dd></div>
              {tx && tx.refundedAmount > 0 && <div><dt>Đã hoàn cho mentee</dt><dd>−{formatVnd(tx.refundedAmount)}</dd></div>}
              <div><dt>Bạn nhận</dt><dd>{formatVnd(net)}</dd></div>
            </dl>
          ) : (
            <dl className="ses-dl">
              <div><dt>Học phí {session.durationMinutes} phút</dt><dd>{formatVnd(gross)}</dd></div>
              {promo > 0 && <div><dt>Trong đó từ tiền khuyến mãi</dt><dd>{formatVnd(promo)}</dd></div>}
              {tx && tx.refundedAmount > 0 && <div><dt>Đã hoàn về ví</dt><dd>{formatVnd(tx.refundedAmount)}</dd></div>}
              <div><dt>Đã thanh toán</dt><dd>{tx ? formatVnd(tx.amount - tx.refundedAmount) : formatVnd(0)}</dd></div>
            </dl>
          )}
          <p className="text-small text-ink-muted">
            {held ? `Khoản này đang được tạm giữ${tx?.holdReason ? `: ${tx.holdReason}` : ""} cho tới khi quản trị viên kết luận.`
              : isMentor ? "Sau khi hết thời gian chờ và không có khiếu nại, khoản này vào mục “Có thể rút”."
              : "Học phí chuyển sang trạng thái chờ giải phóng sau khi phiên hoàn thành; bạn vẫn có thể khiếu nại trong thời hạn quy định."}
          </p>
          <div className="flex flex-wrap gap-x-4">
            {isMentor
              ? <Link href="/earnings" className="inline-flex min-h-[44px] items-center font-semibold">Xem thu nhập</Link>
              : tx && <Link href="/payment/transactions" className="inline-flex min-h-[44px] items-center font-semibold">Xem giao dịch và biên lai</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
