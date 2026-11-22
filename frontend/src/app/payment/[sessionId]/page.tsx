"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { ShieldCheck, TriangleAlert, Wallet as WalletIcon } from "lucide-react";
import { Alert, Button, ButtonLink, Loading } from "@/components/ui";
import { FlowChoice, FlowHead, FlowPill, FlowTile } from "@/features/mentoring/FlowKit";
import { BookedResult } from "@/features/mentoring/FlowResult";
import { mentoringApi } from "@/features/mentoring/api";
import { VOUCHER_PAY_SUPPORTED, payFromWalletWithVoucher, rememberPayBack } from "@/features/mentoring/payWithVoucher";
import { feePercent, paymentApi, paymentReasonLabel, type RedirectProvider } from "@/features/payment/api";
import VoucherPicker from "@/features/referral/VoucherPicker";
import type { VoucherQuote } from "@/features/referral/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { SESSION_STATUS_LABELS, SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { MentoringSession, Transaction, Wallet } from "@/types";

const HOLD_MS = 15 * 60_000;
type Gateway = RedirectProvider | "SANDBOX";

const GATEWAYS: Record<Gateway, { name: string; hint: string; logo: string; color?: string }> = {
  MOMO: { name: "Ví MoMo", hint: "Quét mã hoặc mở ứng dụng", logo: "MoMo", color: "#b0006d" },
  VNPAY: { name: "VNPay", hint: "Thẻ ATM nội địa, QR ngân hàng", logo: "VNPay", color: "#005baa" },
  SANDBOX: { name: "Sandbox", hint: "Chỉ dùng để thử nghiệm, không trừ tiền thật", logo: "TEST" },
};

const mmss = (ms: number) => {
  const s = Math.max(Math.floor(ms / 1000), 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Bản chốt v2.0 §1/§5 — học phí chỉ trả từ ví. Trang này hiển thị khi phiên còn PENDING (ví chưa đủ tiền lúc đặt lịch):
 * nạp thêm rồi bấm "Thanh toán". Khung giờ được giữ 15 phút từ lúc đặt. Phiên đã được tạm giữ học phí → màn hình hoàn tất.
 */
function Payment({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const booked = useSearchParams().get("booked") === "1";
  const [session, setSession] = useState<MentoringSession | null | undefined>(undefined);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [result, setResult] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<VoucherQuote | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Nạp ví ngay trên trang (trạng thái ví thiếu tiền)
  const [methods, setMethods] = useState<{ redirect: RedirectProvider | null; sandboxCard: boolean } | null>(null);
  const [topAmount, setTopAmount] = useState<number | null>(null);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [topBusy, setTopBusy] = useState(false);

  useEffect(() => {
    mentoringApi.session(sessionId).then(setSession).catch((e) => { setError(errorMessage(e)); setSession(null); });
    paymentApi.wallet().then(setWallet).catch(() => {});
    paymentApi.sessionTransactions(sessionId).then(setHistory).catch(() => {});
    paymentApi.methods().then(setMethods).catch(() => setMethods({ redirect: null, sandboxCard: true }));
  }, [sessionId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function pay() {
    setBusy(true);
    setError("");
    try {
        const tx = await payFromWalletWithVoucher(sessionId, quote && !quote.reason ? quote.voucherId : null);
      setResult(tx);
      setHistory((h) => [tx, ...h.filter((x) => x.id !== tx.id)]);
      mentoringApi.session(sessionId).then(setSession).catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === "INSUFFICIENT_FUNDS") paymentApi.wallet().then(setWallet).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) return <Loading />;
  if (!session) return <Alert>{error}</Alert>;

  const price = Number(session.price);
  const available = wallet ? wallet.cash + wallet.promo : 0;
  const enough = !!wallet && wallet.status === "ACTIVE" && available >= price;
  const shortfall = Math.max(price - available, 0);
  const pending = session.status === "PENDING";
  const heldLeft = new Date(session.createdAt).getTime() + HOLD_MS - now;
  const discount = quote?.discount ?? 0;
  const charged = VOUCHER_PAY_SUPPORTED && quote ? quote.payable : price;
  const paidTx = result?.status === "SUCCESS" ? result : history.find((t) => t.status === "SUCCESS" || t.status === "ON_HOLD" || t.status === "PARTIALLY_REFUNDED");
  const done = !pending && (booked || result?.status === "SUCCESS") && session.status === "AWAITING_MENTOR";

  // Gợi ý số tiền nạp
  const topMin = wallet?.topupMin ?? 10_000;
  const topMax = wallet?.topupMax ?? 50_000_000;
  const need = Math.max(Math.ceil(shortfall / 10_000) * 10_000, topMin);
  const amounts = [...new Set([need, 300_000, 500_000])].filter((a) => a >= need && a <= topMax).sort((a, b) => a - b);
  const amount = topAmount && amounts.includes(topAmount) ? topAmount : amounts[0] ?? need;
  const gateways: Gateway[] = [...(methods?.redirect ? [methods.redirect] : []), ...(methods?.sandboxCard !== false || !methods?.redirect ? ["SANDBOX" as const] : [])];
  const gw: Gateway = gateway && gateways.includes(gateway) ? gateway : gateways[0] ?? "SANDBOX";
  const backPath = `/payment/${sessionId}`;
  const walletHref = `/wallet?needed=${price}&back=${encodeURIComponent(backPath)}`;

  async function topup() {
    setTopBusy(true);
    setError("");
    try {
      if (gw === "SANDBOX") {
        router.push(walletHref); // nạp bằng thẻ thử nằm ở trang Ví
        return;
      }
      const r = await paymentApi.topupWithGateway(amount, gw);
      rememberPayBack(backPath);
      window.location.href = r.paymentUrl;
    } catch (err) {
      setError(errorMessage(err));
      setTopBusy(false);
    }
  }

  const sessionKind = session.sessionType ? SESSION_TYPE_LABELS[session.sessionType] : session.kind === "TRIAL" ? "Buổi trải nghiệm" : "Phiên mentoring";

  return (
    <div className="fl-page">
      <FlowHead step={done ? 4 : 3} title={done ? undefined : "Thanh toán từ ví"}
        lead={done ? undefined : "Học phí được tạm giữ từ ví và chỉ chuyển cho mentor sau khi buổi học hoàn thành."} />
      {done ? (
        <BookedResult session={session} amount={paidTx ? Number(paidTx.amount) : price} receiptId={paidTx?.id} />
      ) : (
        <div className="fl-layout">
          <main className="fl-main" style={{ gap: 28 }}>
            <Alert>{error}</Alert>
            {!pending ? (
              <Alert tone="info" action={<ButtonLink href="/mentoring/sessions" size="sm">Phiên học</ButtonLink>}>
                {session.status === "AWAITING_MENTOR" ? "Học phí đã được tạm giữ, đang chờ mentor xác nhận." : "Phiên không ở trạng thái chờ thanh toán."}
              </Alert>
            ) : !wallet ? (
              <Loading />
            ) : wallet.status !== "ACTIVE" ? (
              <Alert tone="warning" action={<ButtonLink href="/wallet" size="sm">Mở trang Ví</ButtonLink>}>
                Ví đang ở trạng thái {wallet.status === "FROZEN" ? "đóng băng" : "ngủ"} — mở trang Ví để xem chi tiết.
              </Alert>
            ) : enough ? (
              <section className="fl-panel" aria-label="Thanh toán từ ví">
                <div className="fl-panel-head">
                  <h2><span className="fl-ico" aria-hidden="true"><WalletIcon /></span>Ví của bạn</h2>
                  <Link href="/wallet" className="fl-link">Nạp thêm</Link>
                </div>
                <div className="fl-panel-body" style={{ gap: 16 }}>
                  <div className="fl-balance"><span className="fl-muted">Số dư khả dụng</span><b className="tabular">{formatMoney(available)}</b></div>
                  <div className="fl-group-label">Mã giảm giá</div>
                  <VoucherPicker tuition={price} onChange={setQuote} disabled={busy} />
                  {discount > 0 && !VOUCHER_PAY_SUPPORTED && (
                    <p className="fl-fine" style={{ margin: 0 }}>
                      Giảm giá mới được hiển thị: hệ thống thanh toán chưa trừ mã nên học phí tạm giữ hiện là {formatMoney(price)}.
                    </p>
                  )}
                  <div className="fl-box">
                    <div><b>Tạm giữ</b><b>{formatMoney(charged)}</b></div>
                    <div className="fl-muted"><span>Số dư sau khi giữ</span><span>{formatMoney(Math.max(available - charged, 0))}</span></div>
                  </div>
                  <Button variant="primary" size="lg" block icon={WalletIcon} loading={busy} onClick={pay}>
                    {busy ? "Đang xử lý…" : `Thanh toán ${formatMoney(charged)}`}
                  </Button>
                </div>
              </section>
            ) : (
              <section className="fl-panel" aria-label="Nạp ví để thanh toán">
                <div className="fl-panel-head">
                  <h2><span className="fl-ico" data-tone="warn" aria-hidden="true"><TriangleAlert /></span>Ví chưa đủ tiền</h2>
                </div>
                <div className="fl-panel-body" style={{ gap: 18 }}>
                  <div className="fl-note fl-note-warn" role="status" style={{ fontSize: 14 }}>
                    Số dư <b>{formatMoney(available)}</b>, cần <b>{formatMoney(price)}</b>. Bạn cần nạp thêm ít nhất <b>{formatMoney(shortfall)}</b>.{" "}
                    {heldLeft > 0 ? <>Khung giờ đang giữ cho bạn <b>{mmss(heldLeft)}</b> nữa.</> : "Thời gian giữ khung giờ đã hết, hệ thống sắp mở lại khung giờ này."}
                  </div>
                  <div className="fl-group">
                    <div className="fl-group-label">Số tiền nạp</div>
                    <div className="fl-choices">
                      <FlowChoice label="Số tiền nạp" value={amount} onChange={setTopAmount}
                        options={amounts.map((a) => ({ id: a, label: formatMoney(a) }))} />
                      <Link href={walletHref} className="fl-chip">Khác…</Link>
                    </div>
                  </div>
                  <div className="fl-group">
                    <div className="fl-group-label" id="gw-label">Nạp bằng</div>
                    <div role="radiogroup" aria-labelledby="gw-label" className="fl-opts" style={{ gap: 10 }}>
                      {gateways.map((g) => (
                        <label key={g} className="fl-opt" data-checked={gw === g} data-dashed={g === "SANDBOX" && gw !== g} style={{ gap: 14, padding: gw === g ? "13px 15px" : "14px 16px", borderRadius: 12 }}>
                          <input type="radio" name="gateway" checked={gw === g} onChange={() => setGateway(g)} />
                          <span className="fl-logo" style={GATEWAYS[g].color ? { color: GATEWAYS[g].color } : undefined}>{GATEWAYS[g].logo}</span>
                          <span className="min-w-0 flex-1"><b>{GATEWAYS[g].name}</b><small>{GATEWAYS[g].hint}</small></span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button variant="primary" size="lg" block loading={topBusy} onClick={topup}>
                    {gw === "SANDBOX" ? `Nạp ${formatMoney(amount)} bằng thẻ thử` : `Nạp ${formatMoney(amount)} qua ${GATEWAYS[gw].name.replace("Ví ", "")}`}
                  </Button>
                  <p className="fl-fine" style={{ margin: 0, textAlign: "center" }}>Nạp xong, bạn quay lại đây và thanh toán để giữ học phí.</p>
                </div>
              </section>
            )}
          </main>

          <aside className="fl-aside" aria-label="Thông tin phiên">
            <section className="fl-panel fl-side" style={{ padding: 22 }}>
              <h2 style={{ fontSize: 16 }}>Phiên học</h2>
              <div className="mt-3.5 flex items-center gap-3 border-b border-border pb-3.5">
                <FlowTile name={session.mentorName} size="sm" />
                <div className="min-w-0"><b>{session.mentorName}</b><div className="text-[12px] text-ink-muted">{session.kind === "TRIAL" ? "Buổi trải nghiệm" : "Mentor của bạn"}</div></div>
              </div>
              <dl className="fl-dl">
                <div><dt>Loại phiên</dt><dd>{sessionKind}</dd></div>
                <div><dt>Thời gian</dt><dd>{formatDateTime(session.scheduledAt)}</dd></div>
                <div><dt>Thời lượng</dt><dd>{session.durationMinutes} phút</dd></div>
                {session.topic && <div><dt>Chủ đề</dt><dd>{session.topic}</dd></div>}
                <div><dt>Trạng thái</dt><dd><MentoringStatusBadge status={session.status} labels={SESSION_STATUS_LABELS} /></dd></div>
              </dl>
              <div className="fl-total"><span className="text-ink-muted">Học phí</span><b className="tabular">{formatMoney(session.price)}</b></div>
              {pending && <Link href={`/mentoring/book/${session.mentorId}`} className="fl-link" style={{ marginTop: 8 }}>Đổi khung giờ</Link>}
              <p className="fl-fine">Giá đã gồm phí nền tảng. Phiên chưa đủ tiền trong ví sau 15 phút sẽ tự huỷ để giải phóng khung giờ.</p>
            </section>
            <section className="fl-note">
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--accent-ink)", display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={18} aria-hidden="true" />Tiền được giữ an toàn
              </h2>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
                <li>Mentor chỉ nhận tiền khi phiên hoàn thành</li>
                <li>Huỷ sớm được hoàn tiền vào ví</li>
                <li>Có tranh chấp, quản trị viên xem xét trước khi chuyển tiền</li>
              </ul>
            </section>
            {history.length > 0 && (
              <section className="fl-panel fl-side">
                <div className="flex items-center justify-between">
                  <h2>Giao dịch của phiên này</h2>
                  <Link href="/payment/transactions" className="fl-link">Tất cả</Link>
                </div>
                <div className="mt-2.5 grid gap-3 text-[13px]">
                  {history.map((t) => (
                    <div key={t.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="tabular">{formatDateTime(t.createdAt)}</span>
                        <span className="inline-flex items-center gap-2">
                          {t.failureReason && <FlowPill tone="danger">{paymentReasonLabel(t.failureReason)}</FlowPill>}
                          <MentoringStatusBadge status={t.status} />
                        </span>
                      </div>
                      <b className="tabular">{formatMoney(t.amount)}</b>
                      {t.status !== "FAILED" && t.status !== "PENDING" && (
                        <div className="text-ink-muted">
                          Phí nền tảng {feePercent(t.feeRate)}: {formatMoney(t.fee)} · Mentor nhận: {formatMoney(t.mentorEarning)}
                          {Number(t.refundedAmount) > 0 && ` · Đã hoàn: ${formatMoney(t.refundedAmount)}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default function PaymentPage({ params }: { params: { sessionId: string } }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <Suspense>
        <Payment sessionId={params.sessionId} />
      </Suspense>
    </RequireAuth>
  );
}
