"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { TEST_CARDS, paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";

function Payment({ sessionId }) {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [history, setHistory] = useState([]);
  const expiry = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String((d.getFullYear() + 3) % 100).padStart(2, "0")}`;
  })();
  const [card, setCard] = useState({ cardNumber: TEST_CARDS[0][0], cardHolder: "NGUYEN VAN A", expiry, cvv: "123" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mentoringApi.session(sessionId).then(setSession).catch((e) => { setError(e.message); setSession(null); });
    paymentApi.sessionTransactions(sessionId).then(setHistory).catch(() => {});
  }, [sessionId]);

  async function pay(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const tx = await paymentApi.charge(sessionId, session.price, card);
      setResult(tx);
      setHistory([tx, ...history]);
      if (tx.status === "SUCCESS") setTimeout(() => router.push("/mentoring/sessions?paid=1"), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) return <Loading />;
  if (!session) return <Alert>{error}</Alert>;
  const set = (k) => (e) => setCard({ ...card, [k]: e.target.value });

  return (
    <>
      <PageHead title="Thanh toán phiên mentoring" subtitle="Cổng thanh toán sandbox — không phát sinh giao dịch thật." />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Thông tin phiên</h2>
          <p><strong>Mentor:</strong> {session.mentorName}</p>
          <p><strong>Thời gian:</strong> {formatDateTime(session.scheduledAt)} ({session.durationMinutes} phút)</p>
          {session.topic && <p><strong>Chủ đề:</strong> {session.topic}</p>}
          <p><strong>Trạng thái:</strong> <StatusBadge status={session.status} /></p>
          <p className="stat">{formatMoney(session.price)}</p>
          <p className="muted small">Phiên chưa thanh toán sẽ tự huỷ sau 30 phút kể từ lúc đặt để giải phóng khung giờ.</p>
          {history.length > 0 && (
            <>
              <h3 style={{ marginTop: "1rem" }}>Lịch sử giao dịch</h3>
              {history.map((t) => (
                <div key={t.id} className="row between small list-item">
                  <span>{formatDateTime(t.createdAt)}</span>
                  <span>{t.failureReason && <span className="muted">{t.failureReason} </span>}<StatusBadge status={t.status} /></span>
                </div>
              ))}
            </>
          )}
        </div>
        <form className="card" onSubmit={pay}>
          <h2>Thẻ thanh toán</h2>
          {result?.status === "SUCCESS" && <Alert type="success">Thanh toán thành công! Phiên đã được xác nhận. Đang chuyển trang...</Alert>}
          {result?.status === "FAILED" && <Alert>Thanh toán thất bại: {result.failureReason}</Alert>}
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

export default function PaymentPage({ params }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <Payment sessionId={params.sessionId} />
    </RequireAuth>
  );
}
