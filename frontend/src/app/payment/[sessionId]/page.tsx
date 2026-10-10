"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import Link from "next/link";
import { CreditCard, Lock } from "lucide-react";
import { Alert, Avatar, Button, Card, CardBody, CardHeader, DescriptionList, Field, Input, Loading, PageHeader } from "@/components/ui";
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
      <PageHeader title="Thanh toán phiên mentoring" description="Cổng thanh toán sandbox, không phát sinh giao dịch thật."
        back={{ href: "/mentoring/sessions", label: "Phiên học" }} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={pay}>
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><CreditCard aria-hidden="true" className="size-4 text-ink-muted" />Thẻ thanh toán</span>} />
            <CardBody className="flex flex-col gap-4">
              {result?.status === "SUCCESS" && (
                <Alert tone="success" title="Thanh toán thành công">
                  {formatMoney(result.amount)} (phí nền tảng {formatMoney(result.fee)}, mentor nhận {formatMoney(result.mentorEarning)}).
                  Phiên đã được xác nhận, đang chuyển trang…
                </Alert>
              )}
              {result?.status === "FAILED" && <Alert title="Thanh toán thất bại">{paymentReasonLabel(result.failureReason)}. Kiểm tra thẻ hoặc thử thẻ khác.</Alert>}
              <Alert>{error}</Alert>
              {session.status !== "PENDING" ? (
                <Alert tone="info">Phiên không ở trạng thái chờ thanh toán.</Alert>
              ) : (
                <>
                  <Field label="Số thẻ" id="pay-number">
                    <Input id="pay-number" required inputMode="numeric" autoComplete="cc-number" className="font-mono" value={card.cardNumber} onChange={set("cardNumber")} />
                  </Field>
                  <Field label="Chủ thẻ" id="pay-holder">
                    <Input id="pay-holder" autoComplete="cc-name" value={card.cardHolder} onChange={set("cardHolder")} />
                  </Field>
                  <div className="form-grid">
                    <Field label="Hết hạn (MM/YY)" id="pay-exp">
                      <Input id="pay-exp" required autoComplete="cc-exp" className="font-mono" value={card.expiry} onChange={set("expiry")} />
                    </Field>
                    <Field label="CVV" id="pay-cvv">
                      <Input id="pay-cvv" required autoComplete="cc-csc" className="font-mono" value={card.cvv} onChange={set("cvv")} />
                    </Field>
                  </div>
                  <Button type="submit" variant="primary" size="lg" block icon={Lock} loading={busy}>{busy ? "Đang xử lý…" : `Thanh toán ${formatMoney(session.price)}`}</Button>
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
          <Card>
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Avatar name={session.mentorName} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{session.mentorName}</div>
                <div className="text-small text-ink-muted">Phiên mentoring</div>
              </div>
              <MentoringStatusBadge status={session.status} labels={SESSION_STATUS_LABELS} />
            </div>
            <CardBody className="flex flex-col gap-4">
              <DescriptionList items={[
                ["Thời gian", `${formatDateTime(session.scheduledAt)} (${session.durationMinutes} phút)`],
                ...(session.topic ? [["Chủ đề", session.topic] as [string, string]] : []),
              ]} />
              <hr className="divider" />
              <div className="flex items-baseline justify-between">
                <span className="text-ink-muted">Tổng thanh toán</span>
                <span className="font-mono text-title-1 font-medium tabular">{formatMoney(session.price)}</span>
              </div>
              <p className="text-small text-ink-muted">Giá đã gồm phí nền tảng. Phiên chưa thanh toán tự huỷ sau 30 phút kể từ lúc đặt để giải phóng khung giờ.</p>
            </CardBody>
          </Card>
          {history.length > 0 && (
            <Card>
              <CardHeader title="Lịch sử giao dịch" actions={<Link href="/payment/transactions" className="text-small">Tất cả giao dịch</Link>} />
              <div className="flex flex-col divide-y divide-border">
                {history.map((t) => (
                  <div key={t.id} className="flex flex-col gap-1 px-5 py-3 text-small">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="tabular">{formatDateTime(t.createdAt)}</span>
                      <span className="inline-flex items-center gap-2">{t.failureReason && <span className="text-ink-muted">{paymentReasonLabel(t.failureReason)}</span>}<MentoringStatusBadge status={t.status} /></span>
                    </div>
                    {t.status !== "FAILED" && t.status !== "PENDING" && (
                      <div className="text-ink-muted">
                        Phí nền tảng {feePercent(t.feeRate)}: {formatMoney(t.fee)} · Mentor nhận: {formatMoney(t.mentorEarning)}
                        {Number(t.refundedAmount) > 0 && ` · Đã hoàn: ${formatMoney(t.refundedAmount)}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
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
