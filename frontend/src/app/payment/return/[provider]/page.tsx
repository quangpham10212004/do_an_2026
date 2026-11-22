"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, ButtonLink, Loading } from "@/components/ui";
import { FlowHead } from "@/features/mentoring/FlowKit";
import { BookedResult, FlowResult } from "@/features/mentoring/FlowResult";
import { mentoringApi } from "@/features/mentoring/api";
import { clearPayBack, peekPayBack } from "@/features/mentoring/payWithVoucher";
import { PROVIDER_LABELS, paymentApi, paymentReasonLabel, type RedirectProvider } from "@/features/payment/api";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MentoringSession, Transaction } from "@/types";

/** PRD-PAY-12 — chờ tối đa 30 giây (hỏi lại mỗi 3 giây) khi VNPay chưa xác nhận xong. */
const POLL_MS = 3000;
const POLL_LIMIT = 10;
const HOLD_MS = 15 * 60_000;

const mmss = (ms: number) => {
  const s = Math.max(Math.floor(ms / 1000), 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * US-56 — MoMo / VNPay chuyển trình duyệt về /payment/return/{momo|vnpay} kèm tham số kết quả. Trang chỉ hiển thị: server
 * kiểm chữ ký rồi hỏi cổng trạng thái thật; tham số trên URL không tự đổi trạng thái giao dịch.
 */
function PaymentReturn({ provider }: { provider: string }) {
  const label = PROVIDER_LABELS[provider.toUpperCase() as RedirectProvider] ?? provider;
  const router = useRouter();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [session, setSession] = useState<MentoringSession | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setBack(peekPayBack());
    const search = window.location.search;
    if (search.length < 2) {
      setError(`Thiếu thông tin giao dịch từ ${label}.`);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async (n: number) => {
      try {
        const t = await paymentApi.confirmReturn(provider, search);
        if (cancelled) return;
        setTx(t);
        setAttempts(n);
        if (t.status === "PENDING" && n < POLL_LIMIT) timer = setTimeout(() => check(n + 1), POLL_MS);
        if (t.status === "SUCCESS" && t.kind === "TOPUP") {
          // Nạp ví xong: quay lại trang thanh toán nếu bắt đầu từ đó, không thì về Ví.
          const target = peekPayBack();
          clearPayBack();
          timer = setTimeout(() => router.push(target ?? "/wallet?topup=1"), 2000);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    };
    check(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, provider, label]);

  // Thanh toán học phí: lấy phiên để hiện màn hình hoàn tất / thời gian còn giữ khung giờ.
  const sessionId = tx?.kind === "SESSION" ? tx.sessionId : null;
  useEffect(() => {
    if (sessionId) mentoringApi.session(sessionId).then(setSession).catch(() => {});
  }, [sessionId, tx?.status]);

  useEffect(() => {
    if (tx?.status !== "FAILED") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tx?.status]);

  const heldLeft = session && session.status === "PENDING" ? new Date(session.createdAt).getTime() + HOLD_MS - now : 0;
  const retryHref = tx?.kind === "SESSION" && tx.sessionId ? `/payment/${tx.sessionId}` : back ?? "/wallet";

  return (
    <div className="fl-page">
      <FlowHead step={tx?.status === "SUCCESS" && tx.kind === "SESSION" ? 4 : 3} />
      <Alert>{error}</Alert>
      {!tx && !error && <Loading />}
      {tx?.status === "SUCCESS" && (tx.kind === "SESSION" ? (
        session ? <BookedResult session={session} amount={Number(tx.amount)} receiptId={tx.id} /> : (
          <FlowResult title="Thanh toán thành công"
            lead={`${formatMoney(tx.amount)} đã được tạm giữ (phí nền tảng ${formatMoney(tx.fee)}, mentor nhận ${formatMoney(tx.mentorEarning)}). Mentor sẽ xác nhận phiên trong 24 giờ.`}>
            <ButtonLink href="/mentoring/sessions?paid=1" variant="primary" size="lg" className="fl-block">Xem phiên học</ButtonLink>
            <ButtonLink href={`/payment/receipts/${tx.id}`} className="fl-block">Xem biên lai</ButtonLink>
          </FlowResult>
        )
      ) : (
        <FlowResult title="Nạp ví thành công" lead={`Đã nạp ${formatMoney(tx.amount)} vào ví. Đang chuyển trang…`}>
          <ButtonLink href={back ?? "/wallet?topup=1"} variant="primary" size="lg" className="fl-block">{back ? "Quay lại thanh toán" : "Về trang Ví"}</ButtonLink>
        </FlowResult>
      ))}
      {tx?.status === "FAILED" && (
        <FlowResult tone="danger" title="Thanh toán không thành công"
          lead={`${paymentReasonLabel(tx.failureReason) || `${label} báo giao dịch thất bại`}. Chưa bị trừ tiền.`}>
          {heldLeft > 0 && (
            <div className="fl-note fl-note-warn" role="status">Khung giờ vẫn được giữ cho bạn thêm <b>{mmss(heldLeft)}</b>.</div>
          )}
          <ButtonLink href={retryHref} variant="primary" size="lg" className="fl-block">{tx.kind === "TOPUP" ? "Thử nạp lại" : "Thử thanh toán lại"}</ButtonLink>
          {session && <ButtonLink href={`/mentoring/book/${session.mentorId}`} className="fl-block">Chọn khung giờ khác</ButtonLink>}
        </FlowResult>
      )}
      {tx?.status === "PENDING" && (
        <FlowResult tone="pending" title="Đang xác nhận thanh toán"
          lead={attempts < POLL_LIMIT
            ? `${label} đang báo kết quả cho chúng tôi. Thường mất vài giây, bạn không cần tải lại trang.`
            : `${label} chưa xác nhận giao dịch. Hệ thống sẽ tự kiểm tra lại trong vài phút; bạn có thể xem trạng thái ở trang Phiên học.`}>
          <div className="fl-box" style={{ fontSize: 13 }}>
            <div><span className="fl-muted">{tx.kind === "TOPUP" ? "Nạp ví" : "Học phí"}</span><b>{formatMoney(tx.amount)}</b></div>
            <div><span className="fl-muted">Mã giao dịch</span><span className="font-mono break-all">{tx.providerReference || tx.id}</span></div>
          </div>
          <ButtonLink href="/wallet" variant="ghost">Về trang Ví</ButtonLink>
        </FlowResult>
      )}
    </div>
  );
}

export default function PaymentReturnPage({ params }: { params: { provider: string } }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <PaymentReturn provider={params.provider} />
    </RequireAuth>
  );
}
