"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import Link from "next/link";
import { Alert, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { TEST_CARDS, feePercent, newIdempotencyKey, paymentApi, paymentReasonLabel } from "@/features/payment/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { SESSION_STATUS_LABELS } from "@/features/mentoring/labels";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { CardInput, MentoringSession, Transaction } from "@/types";

function Payment({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<MentoringSession | null | undefined>(undefined);
  const [history, setHistory] = useState<Transaction[]>([]);
  const expiry = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String((d.getFullYear() + 3) % 100).padStart(2, "0")}`;
  })();
  const [card, setCard] = useState<Required<CardInput>>({ cardNumber: TEST_CARDS[0][0], cardHolder: "NGUYEN VAN A", expiry, cvv: "123" });
  const [result, setResult] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // US-13 — 1 Idempotency-Key cho mỗi lần checkout: giữ nguyên khi gửi lại (mạng lỗi / bấm 2 lần), đổi sau khi có kết quả.
  const [idemKey, setIdemKey] = useState<string>(() => newIdempotencyKey());

  useEffect(() => {
    mentoringApi.session(sessionId).then(setSession).catch((e) => { setError(errorMessage(e)); setSession(null); });
    paymentApi.sessionTransactions(sessionId).then(setHistory).catch(() => {});
  }, [sessionId]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const tx = await paymentApi.charge(sessionId, session.price, card, idemKey);
      setResult(tx);
      setHistory((h) => [tx, ...h.filter((x) => x.id !== tx.id)]);
      setIdemKey(newIdempotencyKey()); // lần thử tiếp theo (vd. đổi thẻ sau khi bị từ chối) là checkout mới
      if (tx.status === "SUCCESS") setTimeout(() => router.push("/mentoring/sessions?paid=1"), 1500);
    } catch (err) {
      setError(errorMessage(err));
      // ApiError = server đã trả lời (key không bị tiêu nếu chưa tạo giao dịch); lỗi mạng → giữ key để gửi lại an toàn
      if (err instanceof ApiError) setIdemKey(newIdempotencyKey());
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) return <Loading />;
  if (!session) return <Alert>{error}</Alert>;
  const set = (k: keyof CardInput) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCard({ ...card, [k]: e.target.value });

  return (
    <>
      <PageHead title="Thanh toán phiên mentoring" subtitle="Cổng thanh toán sandbox — không phát sinh giao dịch thật." />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Thông tin phiên</h2>
          <p><strong>Mentor:</strong> {session.mentorName}</p>
          <p><strong>Thời gian:</strong> {formatDateTime(session.scheduledAt)} ({session.durationMinutes} phút)</p>
          {session.topic && <p><strong>Chủ đề:</strong> {session.topic}</p>}
          <p><strong>Trạng thái:</strong> <MentoringStatusBadge status={session.status} labels={SESSION_STATUS_LABELS} /></p>
          <p className="stat">{formatMoney(session.price)}</p>
          <p className="muted small">Giá đã gồm phí nền tảng; phần mentor nhận được ghi trên giao dịch sau khi thanh toán.</p>
          <p className="muted small">Phiên chưa thanh toán sẽ tự huỷ sau 30 phút kể từ lúc đặt để giải phóng khung giờ.</p>
          {history.length > 0 && (
            <>
              <h3 style={{ marginTop: "1rem" }}>Lịch sử giao dịch</h3>
              {history.map((t) => (
                <div key={t.id} className="small list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div className="row between">
                    <span>{formatDateTime(t.createdAt)}</span>
                    <span>{t.failureReason && <span className="muted">{paymentReasonLabel(t.failureReason)} </span>}<MentoringStatusBadge status={t.status} /></span>
                  </div>
                  {t.status !== "FAILED" && t.status !== "PENDING" && (
                    <div className="muted">
                      Phí nền tảng {feePercent(t.feeRate)}: {formatMoney(t.fee)} · Mentor nhận: {formatMoney(t.mentorEarning)}
                      {Number(t.refundedAmount) > 0 && ` · Đã hoàn: ${formatMoney(t.refundedAmount)}`}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
        <form className="card" onSubmit={pay}>
          <h2>Thẻ thanh toán</h2>
          {result?.status === "SUCCESS" && (
            <Alert type="success">
              Thanh toán thành công {formatMoney(result.amount)} (phí nền tảng {formatMoney(result.fee)}, mentor nhận {formatMoney(result.mentorEarning)}).
              Phiên đã được xác nhận. Đang chuyển trang...
            </Alert>
          )}
          {result?.status === "FAILED" && <Alert>Thanh toán thất bại: {paymentReasonLabel(result.failureReason)}</Alert>}
          <Alert>{error}</Alert>
          {session.status !== "PENDING" ? (
            <Alert type="info">Phiên không ở trạng thái chờ thanh toán.</Alert>
          ) : (
            <>
              <div className="field"><label>Số thẻ</label><input required value={card.cardNumber} onChange={set("cardNumber")} /></div>
              <div className="field"><label>Chủ thẻ</label><input value={card.cardHolder} onChange={set("cardHolder")} /></div>
              <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="field"><label>Hết hạn (MM/YY)</label><input required value={card.expiry} onChange={set("expiry")} /></div>
                <div className="field"><label>CVV</label><input required value={card.cvv} onChange={set("cvv")} /></div>
              </div>
              <button className="btn block" disabled={busy}>{busy ? "Đang xử lý..." : `Thanh toán ${formatMoney(session.price)}`}</button>
              <div className="hint" style={{ marginTop: 10 }}>
                <Link href="/payment/transactions">Xem tất cả giao dịch</Link><br />
                Thẻ test:
                {TEST_CARDS.map(([n, l]) => (
                  <div key={n}><button type="button" className="btn ghost sm" onClick={() => setCard({ ...card, cardNumber: n })}>{n}</button> {l}</div>
                ))}
              </div>
            </>
          )}
        </form>
      </div>
    </>
  );
}

export default function PaymentPage({ params }: { params: { sessionId: string } }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <Payment sessionId={params.sessionId} />
    </RequireAuth>
  );
}
