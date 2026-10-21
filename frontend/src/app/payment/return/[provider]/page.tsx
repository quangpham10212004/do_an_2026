"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, ButtonLink, Card, CardBody, Loading, PageHeader } from "@/components/ui";
import { PROVIDER_LABELS, paymentApi, paymentReasonLabel, type RedirectProvider } from "@/features/payment/api";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { Transaction } from "@/types";

/** PRD-PAY-12 — chờ tối đa 30 giây (hỏi lại mỗi 3 giây) khi VNPay chưa xác nhận xong. */
const POLL_MS = 3000;
const POLL_LIMIT = 10;

/**
 * US-56 — MoMo / VNPay chuyển trình duyệt về /payment/return/{momo|vnpay} kèm tham số kết quả. Trang chỉ hiển thị: server
 * kiểm chữ ký rồi hỏi cổng trạng thái thật; tham số trên URL không tự đổi trạng thái giao dịch.
 */
function PaymentReturn({ provider }: { provider: string }) {
  const label = PROVIDER_LABELS[provider.toUpperCase() as RedirectProvider] ?? provider;
  const router = useRouter();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
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
        if (t.status === "SUCCESS") timer = setTimeout(() => router.push(t.kind === "TOPUP" ? "/wallet?topup=1" : "/mentoring/sessions?paid=1"), 2000);
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

  return (
    <>
      <PageHeader title={`Kết quả thanh toán ${label}`} back={{ href: "/wallet", label: "Ví" }} />
      <Card>
        <CardBody className="flex flex-col gap-4">
          <Alert>{error}</Alert>
          {!tx && !error && <Loading />}
          {tx?.status === "SUCCESS" && (
            <Alert tone="success" title="Thanh toán thành công">
              {formatMoney(tx.amount)} (phí nền tảng {formatMoney(tx.fee)}, mentor nhận {formatMoney(tx.mentorEarning)}).
              Phiên đã được xác nhận, đang chuyển trang…
            </Alert>
          )}
          {tx?.status === "FAILED" && (
            <>
              <Alert title="Thanh toán không thành công">{paymentReasonLabel(tx.failureReason) || `${label} báo giao dịch thất bại`}.</Alert>
              <div>
                <ButtonLink href={`/payment/${tx.sessionId}`} variant="primary">Thử thanh toán lại</ButtonLink>
              </div>
            </>
          )}
          {tx?.status === "PENDING" && (
            <Alert tone="info" title="Đang xác nhận thanh toán">
              {attempts < POLL_LIMIT
                ? `Chúng tôi đang chờ ${label} xác nhận giao dịch…`
                : `${label} chưa xác nhận giao dịch. Hệ thống sẽ tự kiểm tra lại trong vài phút; bạn có thể xem trạng thái ở trang Phiên học.`}
            </Alert>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export default function PaymentReturnPage({ params }: { params: { provider: string } }) {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <PaymentReturn provider={params.provider} />
    </RequireAuth>
  );
}
