"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { ExternalLink, Lock, RotateCcw } from "lucide-react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, FlashAlerts, Input, Loading, PageHeader, type Flash } from "@/components/ui";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { PROVIDER_LABELS, TEST_CARDS, paymentApi, paymentReasonLabel, type RedirectProvider } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { CardInput, TopupRefundRequest, Wallet, WalletEntry, WalletEntryKind } from "@/types";

const ENTRY_LABELS: Record<WalletEntryKind, string> = {
  TOPUP: "Nạp ví",
  HOLD: "Trả học phí (tạm giữ)",
  REFUND_TO_WALLET: "Hoàn học phí về ví",
  TOPUP_REFUND: "Hoàn tiền nạp về nguồn thanh toán",
  PROMO_GRANT: "Nhận khuyến mãi",
  PROMO_EXPIRE: "Khuyến mãi hết hạn",
  ADJUST: "Điều chỉnh",
};

const QUICK_AMOUNTS = [200_000, 500_000, 1_000_000];

function Balance({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "accent" }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="eyebrow">{label}</span>
        <span className={`font-mono text-title-1 font-medium tabular ${tone === "accent" ? "text-accent" : ""}`}>{formatMoney(value)}</span>
        {hint && <span className="text-small text-ink-muted">{hint}</span>}
      </CardBody>
    </Card>
  );
}

function expiryCard(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String((d.getFullYear() + 3) % 100).padStart(2, "0")}`;
}

/** Bản chốt v2.0 §8 — ví VND: số dư, nạp ví, lịch sử, hoàn tiền nạp về nguồn. */
function WalletPage() {
  const router = useRouter();
  const params = useSearchParams();
  const needed = Number(params.get("needed") || 0);
  const back = params.get("back");
  const [wallet, setWallet] = useState<Wallet | null | undefined>(undefined);
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [requests, setRequests] = useState<TopupRefundRequest[]>([]);
  const [gateway, setGateway] = useState<RedirectProvider | null | undefined>(undefined);
  const [amount, setAmount] = useState<number>(needed > 0 ? Math.max(Math.ceil(needed / 10_000) * 10_000, 50_000) : 500_000);
  const [card, setCard] = useState<Required<CardInput>>({ cardNumber: TEST_CARDS[0][0], cardHolder: "NGUYEN VAN A", expiry: expiryCard(), cvv: "123" });
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [exceptionReason, setExceptionReason] = useState("");
  const [needException, setNeedException] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Flash>(params.get("topup") ? { ok: "Nạp ví thành công." } : {});

  const load = useCallback(async () => {
    try {
      const [w, e, r] = await Promise.all([paymentApi.wallet(), paymentApi.walletEntries(0, 30), paymentApi.myTopupRefunds()]);
      setWallet(w);
      setEntries(e.items);
      setRequests(r);
    } catch (err) {
      setWallet((cur) => cur ?? null);
      setMsg({ error: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    load();
    paymentApi.methods().then((m) => setGateway(m.redirect)).catch(() => setGateway(null));
  }, [load]);

  async function topup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      if (gateway) {
        const { paymentUrl } = await paymentApi.topupWithGateway(amount, gateway);
        window.location.assign(paymentUrl);
        return;
      }
      const tx = await paymentApi.topupWithCard(amount, card);
      if (tx.status === "SUCCESS") {
        setMsg({ ok: `Đã nạp ${formatMoney(tx.amount)} vào ví.` });
        await load();
        if (back) router.push(back);
      } else {
        setMsg({ error: `Nạp ví thất bại: ${paymentReasonLabel(tx.failureReason) || "thẻ bị từ chối"}. Số dư không thay đổi.` });
      }
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    try {
      await paymentApi.reactivateWallet();
      setMsg({ ok: "Đã kích hoạt lại ví." });
      load();
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  async function requestRefund(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      const r = await paymentApi.requestTopupRefund(refundAmount, needException ? exceptionReason : undefined);
      setMsg({ ok: r.status === "DONE" ? `Đã hoàn ${formatMoney(r.amount)} về nguồn thanh toán.` : "Đã gửi yêu cầu ngoại lệ, quản trị viên sẽ xem xét." });
      setNeedException(false);
      setExceptionReason("");
      await load();
    } catch (err) {
      setMsg({ error: errorMessage(err) });
      // Ngoài quy định (hết 7 ngày / quá số lần / vượt mức): cho gửi kèm lý do để admin xét ngoại lệ
      if (err instanceof ApiError && ["REFUND_WINDOW_CLOSED", "REFUND_LIMIT_REACHED", "REFUND_AMOUNT_EXCEEDED"].includes(String((err as { code?: string }).code))) {
        setNeedException(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (wallet === undefined || gateway === undefined) return <Loading />;
  if (!wallet) return <Alert>Không tải được ví.</Alert>;
  const usable = wallet.status === "ACTIVE";
  const set = (k: keyof CardInput) => (e: React.ChangeEvent<HTMLInputElement>) => setCard({ ...card, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Ví" description="Học phí luôn được trả từ ví: nạp tiền, đặt lịch, học phí được tạm giữ đến khi buổi học kết thúc." />
      <FlashAlerts flash={msg} className="mb-6" />
      {wallet.status === "FROZEN" && <Alert className="mb-6" title="Ví đang bị đóng băng">Tài khoản của bạn đang bị khoá, chưa thể nạp hay thanh toán. Liên hệ quản trị viên để được hỗ trợ.</Alert>}
      {wallet.status === "DORMANT" && (
        <Alert tone="warning" className="mb-6" title="Ví đang ở trạng thái ngủ" action={<Button size="sm" variant="primary" onClick={reactivate}>Kích hoạt lại</Button>}>
          Ví không có giao dịch trong 12 tháng. Tiền nạp của bạn vẫn được giữ nguyên — kích hoạt lại để tiếp tục sử dụng.
        </Alert>
      )}
      {needed > 0 && usable && (
        <Alert tone="info" className="mb-6">Bạn cần thêm ít nhất {formatMoney(Math.max(needed - wallet.cash - wallet.promo, 0))} để thanh toán buổi học. Nạp xong, bạn sẽ được đưa về trang thanh toán.</Alert>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Balance label="Tiền nạp khả dụng" value={wallet.cash} tone="accent" hint={`Tối đa ${formatMoney(wallet.cashCap)}`} />
        <Balance label="Tiền khuyến mãi" value={wallet.promo} hint={wallet.nextPromoExpiry ? `Sắp hết hạn: ${formatDateTime(wallet.nextPromoExpiry)}` : "Dùng trước tiền nạp"} />
        <Balance label="Đang tạm giữ" value={wallet.held} hint="Học phí buổi chưa kết thúc" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={topup}>
          <Card>
            <CardHeader title="Nạp ví" description={`Từ ${formatMoney(wallet.topupMin)} đến ${formatMoney(wallet.topupMax)} mỗi lần · môi trường thử nghiệm, không phát sinh giao dịch thật.`} />
            <CardBody className="flex flex-col gap-4">
              <Field label="Số tiền (đ)" id="topup-amount">
                <Input id="topup-amount" type="number" required min={wallet.topupMin} max={wallet.topupMax} step={10_000} value={amount || ""}
                  disabled={!usable} onChange={(e) => setAmount(Number(e.target.value))} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((a) => <Button key={a} type="button" size="sm" disabled={!usable} onClick={() => setAmount(a)}>{formatMoney(a)}</Button>)}
              </div>
              {gateway ? (
                <Button type="submit" variant="primary" size="lg" block icon={ExternalLink} loading={busy} disabled={!usable}>
                  {busy ? `Đang chuyển sang ${PROVIDER_LABELS[gateway]}…` : `Nạp ${formatMoney(amount)} qua ${PROVIDER_LABELS[gateway]}`}
                </Button>
              ) : (
                <>
                  <Field label="Số thẻ" id="topup-number">
                    <Input id="topup-number" required inputMode="numeric" autoComplete="cc-number" className="font-mono" value={card.cardNumber} disabled={!usable} onChange={set("cardNumber")} />
                  </Field>
                  <div className="form-grid">
                    <Field label="Hết hạn (MM/YY)" id="topup-exp"><Input id="topup-exp" required autoComplete="cc-exp" className="font-mono" value={card.expiry} disabled={!usable} onChange={set("expiry")} /></Field>
                    <Field label="CVV" id="topup-cvv"><Input id="topup-cvv" required autoComplete="cc-csc" className="font-mono" value={card.cvv} disabled={!usable} onChange={set("cvv")} /></Field>
                  </div>
                  <Button type="submit" variant="primary" size="lg" block icon={Lock} loading={busy} disabled={!usable}>{busy ? "Đang xử lý…" : `Nạp ${formatMoney(amount)}`}</Button>
                  <div className="well flex flex-col gap-1.5 text-small">
                    <div className="eyebrow">Thẻ test sandbox</div>
                    {TEST_CARDS.map(([n, l]) => (
                      <div key={n} className="flex flex-wrap items-center gap-2">
                        <button type="button" className="cursor-pointer font-mono text-accent hover:underline" onClick={() => setCard({ ...card, cardNumber: n })}>{n}</button>
                        <span className="text-ink-muted">{l}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </form>

        <div className="flex min-w-0 flex-col gap-6">
          <form onSubmit={requestRefund}>
            <Card>
              <CardHeader title="Hoàn tiền nạp về nguồn" description="Chỉ tiền nạp khả dụng (không gồm khuyến mãi hay tiền đang tạm giữ), trong 7 ngày kể từ lần nạp gần nhất, tối đa 2 yêu cầu mỗi tháng." />
              <CardBody className="flex flex-col gap-4">
                {wallet.refund.windowOpen ? (
                  <p className="text-small text-ink-muted">
                    Mức hoàn tối đa: <strong className="text-ink">{formatMoney(wallet.refund.maxAmount)}</strong> · còn {wallet.refund.remainingRequests} yêu cầu · hạn {wallet.refund.windowEndsAt ? formatDateTime(wallet.refund.windowEndsAt) : ""}.
                  </p>
                ) : (
                  <p className="text-small text-ink-muted">Đã quá 7 ngày kể từ lần nạp gần nhất — chỉ còn gửi được yêu cầu ngoại lệ cho quản trị viên.</p>
                )}
                <Field label="Số tiền muốn hoàn (đ)" id="refund-amount">
                  <Input id="refund-amount" type="number" required min={1} value={refundAmount || ""} disabled={!usable} onChange={(e) => setRefundAmount(Number(e.target.value))} />
                </Field>
                {(needException || !wallet.refund.windowOpen) && (
                  <Field label="Lý do ngoại lệ" id="refund-reason" hint="Yêu cầu ngoài quy định sẽ do quản trị viên xem xét.">
                    <Input id="refund-reason" value={exceptionReason} maxLength={1000} onChange={(e) => { setExceptionReason(e.target.value); setNeedException(true); }} />
                  </Field>
                )}
                <div><Button type="submit" icon={RotateCcw} loading={busy} disabled={!usable || refundAmount <= 0}>Gửi yêu cầu hoàn tiền</Button></div>
              </CardBody>
            </Card>
          </form>
          {requests.length > 0 && (
            <Card>
              <CardHeader title="Yêu cầu hoàn tiền gần đây" />
              <div className="flex flex-col divide-y divide-border">
                {requests.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-small">
                    <span className="tabular">{formatDateTime(r.createdAt)} · {formatMoney(r.amount)}{r.kind === "EXCEPTION" ? " · ngoại lệ" : ""}</span>
                    <MentoringStatusBadge status={r.status === "DONE" ? "SUCCESS" : r.status === "REJECTED" ? "REJECTED" : "PENDING"} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Lịch sử ví" actions={<Link href="/payment/transactions" className="text-small">Giao dịch học phí</Link>} />
        {entries.length === 0 ? (
          <EmptyState title="Chưa có giao dịch ví" />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {entries.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-small">
                <div className="min-w-0">
                  <div className="font-medium">{ENTRY_LABELS[e.kind] ?? e.kind}{e.bucket === "PROMO" ? " (khuyến mãi)" : ""}</div>
                  <div className="text-ink-muted tabular">{formatDateTime(e.createdAt)}{e.note ? ` · ${e.note}` : ""}</div>
                </div>
                <span className={`font-mono tabular ${e.amount > 0 ? "text-success" : ""}`}>{e.amount > 0 ? "+" : ""}{formatMoney(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default function WalletRoute() {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <Suspense>
        <WalletPage />
      </Suspense>
    </RequireAuth>
  );
}
