"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { PackageOptions, SessionPackage, Uuid } from "@/types";

/**
 * Mua gói buổi với mentor: các mức (số buổi · giảm giá) theo thời lượng đang chọn. Bấm mua tạo gói chờ thanh toán rồi
 * chuyển sang trang thanh toán gói; nếu đang có gói chờ thanh toán với mentor này thì dẫn thẳng tới đó.
 */
export default function PackagePanel({ mentorId, durationMinutes, pending }: {
  mentorId: Uuid;
  durationMinutes: number;
  /** Gói đang chờ thanh toán của mentee với mentor này (nếu có). */
  pending: SessionPackage | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<PackageOptions | null | undefined>(undefined);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    mentoringApi.packageOptions(mentorId, durationMinutes)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => { cancelled = true; };
  }, [mentorId, durationMinutes]);

  async function buy(sessions: number) {
    setBusy(sessions);
    setError("");
    try {
      const pkg = await mentoringApi.purchasePackage(mentorId, sessions, durationMinutes);
      router.push(`/payment/package/${pkg.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!data || data.options.length === 0) return null;
  return (
    <div className="card stack" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
      <strong>Mua gói tiết kiệm</strong>
      <div className="muted small">
        Thanh toán một lần, đặt từng buổi sau (phiên {durationMinutes} phút, lẻ {formatMoney(data.singlePrice)}/buổi). Buổi chưa dùng được hoàn tiền khi gói hết hạn hoặc bị huỷ.
      </div>
      <Alert>{error}</Alert>
      {pending && (
        <Alert type="info">
          Bạn có gói {pending.sessionsTotal} buổi đang chờ thanh toán. <a href={`/payment/package/${pending.id}`}>Thanh toán ngay</a>
        </Alert>
      )}
      <div className="grid grid-2">
        {data.options.map((o) => (
          <div key={o.sessions} className="card stack" style={{ boxShadow: "none" }}>
            <div className="row between">
              <strong>{o.sessions} buổi</strong>
              <span className="badge good">Giảm {o.discountPercent}%</span>
            </div>
            <div className="stat">{formatMoney(o.totalPrice)}</div>
            <div className="small muted">{formatMoney(o.unitPrice)}/buổi · tiết kiệm {formatMoney(o.savings)} · dùng trong {o.validityDays} ngày</div>
            <button type="button" className="btn sm" disabled={busy !== null || !!pending} onClick={() => buy(o.sessions)}>
              {busy === o.sessions ? "Đang tạo gói..." : "Mua gói này"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
