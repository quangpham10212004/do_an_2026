"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { TEST_CARDS, feePercent, newIdempotencyKey, paymentApi, paymentReasonLabel } from "@/features/payment/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { CardInput, SessionPackage, Transaction } from "@/types";

function PackagePayment({ packageId }: { packageId: string }) {
  const router = useRouter();
  const [pkg, setPkg] = useState<SessionPackage | null | undefined>(undefined);
  const [history, setHistory] = useState<Transaction[]>([]);
  const expiry = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String((d.getFullYear() + 3) % 100).padStart(2, "0")}`;
  })();
  const [card, setCard] = useState<Required<CardInput>>({ cardNumber: TEST_CARDS[0][0], cardHolder: "NGUYEN VAN A", expiry, cvv: "123" });
  const [result, setResult] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Một Idempotency-Key cho mỗi lần checkout (xem trang thanh toán phiên lẻ).
  const [idemKey, setIdemKey] = useState<string>(() => newIdempotencyKey());

  useEffect(() => {
    mentoringApi.packages()
      .then((list) => setPkg(list.find((p) => p.id === packageId) || null))
      .catch((e) => { setError(errorMessage(e)); setPkg(null); });
    paymentApi.packageTransactions(packageId).then(setHistory).catch(() => {});
  }, [packageId]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!pkg) return;
    setBusy(true);
    setError("");
    try {
      const tx = await paymentApi.chargePackage(packageId, pkg.totalPrice, card, idemKey);
      setResult(tx);
      setHistory((h) => [tx, ...h.filter((x) => x.id !== tx.id)]);
      setIdemKey(newIdempotencyKey());
      if (tx.status === "SUCCESS") setTimeout(() => router.push("/mentoring/sessions?packagePaid=1"), 1500);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setIdemKey(newIdempotencyKey());
    } finally {
      setBusy(false);
    }
  }

  if (pkg === undefined) return <Loading />;
  if (!pkg) return <Alert>{error || "Không tìm thấy gói buổi."}</Alert>;
  const set = (k: keyof CardInput) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCard({ ...card, [k]: e.target.value });

  return (
    <>
      <PageHead title="Thanh toán gói buổi" subtitle="Cổng thanh toán sandbox — không phát sinh giao dịch thật." />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Thông tin gói</h2>
          <p><strong>Mentor:</strong> {pkg.mentorName}</p>
          <p><strong>Gói:</strong> {pkg.sessionsTotal} buổi · {pkg.durationMinutes} phút/buổi · giảm {pkg.discountPercent}%</p>
          <p><strong>Trạng thái:</strong> <MentoringStatusBadge status={pkg.status} /></p>
          <p className="stat">{formatMoney(pkg.totalPrice)}</p>
          <p className="muted small">{formatMoney(pkg.unitPrice)}/buổi. Giá đã gồm phí nền tảng; sau khi thanh toán bạn đặt từng buổi mà không trả thêm.</p>
          <p className="muted small">Gói chưa thanh toán sẽ tự huỷ sau 30 phút. Buổi chưa dùng được hoàn tiền khi gói hết hạn hoặc bị huỷ.</p>
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
            <Alert type="success">Thanh toán thành công {formatMoney(result.amount)}. Gói đã được kích hoạt. Đang chuyển trang...</Alert>
          )}
          {result?.status === "FAILED" && <Alert>Thanh toán thất bại: {paymentReasonLabel(result.failureReason)}</Alert>}
          <Alert>{error}</Alert>
          {pkg.status !== "PENDING_PAYMENT" ? (
            <Alert type="info">Gói không ở trạng thái chờ thanh toán. <Link href="/mentoring/sessions">Về trang phiên học</Link></Alert>
          ) : (
            <>
              <div className="field"><label>Số thẻ</label><input required value={card.cardNumber} onChange={set("cardNumber")} /></div>
              <div className="field"><label>Chủ thẻ</label><input value={card.cardHolder} onChange={set("cardHolder")} /></div>
              <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="field"><label>Hết hạn (MM/YY)</label><input required value={card.expiry} onChange={set("expiry")} /></div>
                <div className="field"><label>CVV</label><input required value={card.cvv} onChange={set("cvv")} /></div>
              </div>
              <button className="btn block" disabled={busy}>{busy ? "Đang xử lý..." : `Thanh toán ${formatMoney(pkg.totalPrice)}`}</button>
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

export default function PackagePaymentPage({ params }: { params: { packageId: string } }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <PackagePayment packageId={params.packageId} />
    </RequireAuth>
  );
}
