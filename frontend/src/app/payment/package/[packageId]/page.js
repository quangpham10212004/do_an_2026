"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { TEST_CARDS, paymentApi } from "@/features/payment/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

/** Thanh toán gói buổi: thu một lần cho cả gói, sau đó gói được kích hoạt để đặt từng buổi. */
function PackagePayment({ packageId }) {
  const router = useRouter();
  const [pack, setPack] = useState(undefined);
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
    mentoringApi.packages()
      .then((ps) => setPack(ps.find((p) => p.id === packageId) || null))
      .catch((e) => { setError(e.message); setPack(null); });
    paymentApi.packageTransactions(packageId).then(setHistory).catch(() => {});
  }, [packageId]);

  async function pay(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const tx = await paymentApi.chargePackage(packageId, pack.totalPrice, card);
      setResult(tx);
      setHistory([tx, ...history]);
      if (tx.status === "SUCCESS") setTimeout(() => router.push("/mentoring/sessions?paid=1"), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (pack === undefined) return <Loading />;
  if (!pack) return <Alert>{error || "Không tìm thấy gói buổi."}</Alert>;
  const set = (k) => (e) => setCard({ ...card, [k]: e.target.value });

  return (
    <>
      <PageHead title="Thanh toán gói buổi" subtitle="Cổng thanh toán sandbox — không phát sinh giao dịch thật." />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Thông tin gói</h2>
          <p><strong>Mentor:</strong> {pack.mentorName}</p>
          <p><strong>Gói:</strong> {pack.sessionsTotal} buổi × {pack.durationMinutes} phút</p>
          <p><strong>Giá mỗi buổi:</strong> {formatMoney(pack.unitPrice)} (giảm {pack.discountPercent}%)</p>
          <p><strong>Trạng thái:</strong> <StatusBadge status={pack.status} /></p>
          <p className="stat">{formatMoney(pack.totalPrice)}</p>
          <p className="muted small">Sau khi thanh toán, bạn dùng gói trong thời hạn quy định để đặt từng buổi. Buổi chưa dùng khi gói hết hạn hoặc bị huỷ sẽ được hoàn tiền. Gói chưa thanh toán tự huỷ sau 30 phút.</p>
          {pack.expiresAt && <p className="small">Hết hạn: {formatDate(pack.expiresAt)}</p>}
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
          {result?.status === "SUCCESS" && <Alert type="success">Thanh toán thành công! Gói đã được kích hoạt. Đang chuyển trang...</Alert>}
          {result?.status === "FAILED" && <Alert>Thanh toán thất bại: {result.failureReason}</Alert>}
          <Alert>{error}</Alert>
          {pack.status !== "PENDING_PAYMENT" ? (
            <Alert type="info">Gói không ở trạng thái chờ thanh toán.</Alert>
          ) : (
            <>
              <div className="field"><label>Số thẻ</label><input required value={card.cardNumber} onChange={set("cardNumber")} /></div>
              <div className="field"><label>Chủ thẻ</label><input value={card.cardHolder} onChange={set("cardHolder")} /></div>
              <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="field"><label>Hết hạn (MM/YY)</label><input required value={card.expiry} onChange={set("expiry")} /></div>
                <div className="field"><label>CVV</label><input required value={card.cvv} onChange={set("cvv")} /></div>
              </div>
              <button className="btn block" disabled={busy}>{busy ? "Đang xử lý..." : `Thanh toán ${formatMoney(pack.totalPrice)}`}</button>
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

export default function PackagePaymentPage({ params }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <PackagePayment packageId={params.packageId} />
    </RequireAuth>
  );
}
