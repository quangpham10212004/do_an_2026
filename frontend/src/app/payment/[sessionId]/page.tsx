"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import Link from "next/link";
import { Wallet as WalletIcon } from "lucide-react";
import { Alert, Avatar, Button, ButtonLink, Card, CardBody, CardHeader, DescriptionList, Loading, PageHeader } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { feePercent, paymentApi, paymentReasonLabel } from "@/features/payment/api";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { SESSION_STATUS_LABELS } from "@/features/mentoring/labels";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { MentoringSession, Transaction, Wallet } from "@/types";

/**
 * Bản chốt v2.0 §1/§5 — học phí chỉ trả từ ví. Trang này hiển thị khi phiên còn PENDING (ví chưa đủ tiền lúc đặt lịch):
 * nạp thêm rồi bấm "Thanh toán từ ví". Khung giờ được giữ 15 phút từ lúc đặt.
 */
function Payment({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<MentoringSession | null | undefined>(undefined);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [result, setResult] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mentoringApi.session(sessionId).then(setSession).catch((e) => { setError(errorMessage(e)); setSession(null); });
    paymentApi.wallet().then(setWallet).catch(() => {});
    paymentApi.sessionTransactions(sessionId).then(setHistory).catch(() => {});
  }, [sessionId]);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const tx = await paymentApi.payFromWallet(sessionId);
      setResult(tx);
      setHistory((h) => [tx, ...h.filter((x) => x.id !== tx.id)]);
      setTimeout(() => router.push("/mentoring/sessions?booked=1"), 1500);
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

  return (
    <>
      <PageHeader title="Thanh toán từ ví" description="Học phí được tạm giữ từ ví và chỉ chuyển cho mentor sau khi buổi học hoàn thành."
        back={{ href: "/mentoring/sessions", label: "Phiên học" }} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><WalletIcon aria-hidden="true" className="size-4 text-ink-muted" />Ví của bạn</span>} />
          <CardBody className="flex flex-col gap-4">
            {result?.status === "SUCCESS" && (
              <Alert tone="success" title="Đã tạm giữ học phí">
                {formatMoney(result.amount)} (khuyến mãi {formatMoney(result.paidPromo)}, tiền nạp {formatMoney(result.paidCash)}). Đang chờ mentor xác nhận, đang chuyển trang…
              </Alert>
            )}
            <Alert>{error}</Alert>
            {!pending ? (
              <Alert tone="info">
                {session.status === "AWAITING_MENTOR" ? "Học phí đã được tạm giữ, đang chờ mentor xác nhận." : "Phiên không ở trạng thái chờ thanh toán."}
              </Alert>
            ) : !wallet ? (
              <Loading />
            ) : (
              <>
                <DescriptionList items={[
                  ["Tiền nạp khả dụng", formatMoney(wallet.cash)],
                  ["Tiền khuyến mãi", formatMoney(wallet.promo)],
                  ["Cần thanh toán", formatMoney(price)],
                ]} />
                {wallet.status !== "ACTIVE" ? (
                  <Alert tone="warning">Ví đang ở trạng thái {wallet.status === "FROZEN" ? "đóng băng" : "ngủ"} — mở trang Ví để xem chi tiết.</Alert>
                ) : enough ? (
                  <Button variant="primary" size="lg" block icon={WalletIcon} loading={busy} onClick={pay}>
                    {busy ? "Đang xử lý…" : `Thanh toán ${formatMoney(price)} từ ví`}
                  </Button>
                ) : (
                  <>
                    <Alert tone="warning">Ví còn thiếu {formatMoney(shortfall)}. Nạp thêm để giữ khung giờ này (giữ tối đa 15 phút từ lúc đặt).</Alert>
                    <ButtonLink variant="primary" href={`/wallet?needed=${price}&back=${encodeURIComponent(`/payment/${sessionId}`)}`}>Nạp ví</ButtonLink>
                  </>
                )}
              </>
            )}
          </CardBody>
        </Card>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Avatar name={session.mentorName} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{session.mentorName}</div>
                <div className="text-small text-ink-muted">{session.kind === "TRIAL" ? "Buổi trải nghiệm" : "Phiên mentoring"}</div>
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
                <span className="text-ink-muted">Học phí</span>
                <span className="font-mono text-title-1 font-medium tabular">{formatMoney(session.price)}</span>
              </div>
              <p className="text-small text-ink-muted">
                Giá đã gồm phí nền tảng. Mentor cần xác nhận trong 24 giờ; nếu không xác nhận hoặc từ chối, học phí được hoàn 100% về ví.
                Phiên chưa đủ tiền trong ví sau 15 phút sẽ tự huỷ để giải phóng khung giờ.
              </p>
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
