"use client";

import { useEffect, useId, useState } from "react";
import { Alert, Button, Input, Loading } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/format";
import { referralApi, voucherQuoteLocal, type Voucher, type VoucherQuote } from "./api";

interface VoucherPickerProps {
  /** Học phí của phiên (đ) để tính giảm giá. */
  tuition: number;
  /** Gọi mỗi khi người dùng đổi lựa chọn; `quote.voucherId = null` = không dùng mã. Trang thanh toán dùng `discount`/`payable`. */
  onChange: (quote: VoucherQuote) => void;
  /** Chọn sẵn một mã (vd. mã sắp hết hạn nhất được chọn mặc định nếu bỏ trống và `autoSelect`). */
  initialVoucherId?: string | null;
  autoSelect?: boolean;
  disabled?: boolean;
}

/**
 * Chọn mã giảm giá khi thanh toán (RefVoucher, khối "Khi thanh toán phiên học").
 * Chưa gắn vào trang thanh toán: nối bằng
 *   <VoucherPicker tuition={fee} onChange={(q) => setDiscount(q.discount)} />
 * Mỗi phiên dùng 1 mã; việc trừ mã thật và trả lại khi huỷ phiên do backend xử lý.
 */
export default function VoucherPicker({ tuition, onChange, initialVoucherId = null, autoSelect = true, disabled }: VoucherPickerProps) {
  const [list, setList] = useState<Voucher[] | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(initialVoucherId);
  const [custom, setCustom] = useState("");
  const [customErr, setCustomErr] = useState("");
  const [busy, setBusy] = useState(false);
  const name = useId();

  useEffect(() => {
    let alive = true;
    referralApi.vouchers().then((vs) => {
      if (!alive) return;
      const usable = vs.filter((v) => v.status === "ACTIVE");
      setList(usable);
      if (autoSelect && !initialVoucherId && usable.length > 0) {
        const best = [...usable].sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""))[0];
        setSelected(best.id);
      }
    }).catch(() => alive && setList([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tính lại khi lựa chọn hoặc học phí đổi.
  useEffect(() => {
    if (list === undefined) return;
    const v = list.find((x) => x.id === selected) ?? null;
    onChange(voucherQuoteLocal(v, tuition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, selected, tuition]);

  async function applyCustom() {
    const code = custom.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setCustomErr("");
    try {
      const q = await referralApi.quote({ code, tuition });
      if (q.reason || !q.voucherId) { setCustomErr(q.reason || "Mã không dùng được."); return; }
      const vs = await referralApi.vouchers();
      const v = vs.find((x) => x.id === q.voucherId);
      if (v) setList((cur) => (cur?.some((x) => x.id === v.id) ? cur : [...(cur ?? []), v]));
      setSelected(q.voucherId);
      setCustom("");
    } catch {
      setCustomErr("Không kiểm tra được mã lúc này. Thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  if (list === undefined) return <Loading text="Đang tải mã giảm giá…" />;
  const chosen = list.find((v) => v.id === selected) ?? null;
  const q = voucherQuoteLocal(chosen, tuition);

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Chọn mã giảm giá" className="flex flex-col gap-2">
        {list.map((v) => {
          const r = voucherQuoteLocal(v, tuition);
          return (
            <label key={v.id} className="rf-opt" data-checked={selected === v.id} data-disabled={!!r.reason}>
              <input type="radio" name={name} checked={selected === v.id} disabled={disabled || !!r.reason} onChange={() => setSelected(v.id)} />
              <span className="min-w-0 flex-1">
                <b>Giảm {formatMoney(v.amount)}</b>
                <span className="block text-small text-ink-muted">{v.code}{v.expiresAt ? ` · hết hạn ${formatDate(v.expiresAt)}` : ""}</span>
                {r.reason && <span className="block text-small text-danger">{r.reason}</span>}
              </span>
            </label>
          );
        })}
        <label className="rf-opt" data-checked={selected === null}>
          <input type="radio" name={name} checked={selected === null} disabled={disabled} onChange={() => setSelected(null)} />
          <span>Không dùng mã</span>
        </label>
      </div>
      <div className="input-group">
        <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nhập mã khác" aria-label="Nhập mã khác" maxLength={24}
          className="font-mono" disabled={disabled} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }} />
        <Button onClick={applyCustom} loading={busy} disabled={disabled || !custom.trim()}>Áp dụng</Button>
      </div>
      <Alert>{customErr}</Alert>
      <dl className="rf-sum">
        <div><dt>Học phí 60 phút</dt><dd>{formatMoney(q.tuition)}</dd></div>
        <div><dt>Mã giảm giá</dt><dd>{q.discount ? `−${formatMoney(q.discount)}` : "0 đ"}</dd></div>
        <div className="rf-sum-total"><dt>Tạm giữ từ ví</dt><dd>{formatMoney(q.payable)}</dd></div>
      </dl>
      <p className="text-small text-ink-muted">Mỗi phiên dùng 1 mã. Nếu huỷ phiên, mã được trả lại nếu còn hạn. Phần giảm giá không tính vào thu nhập mentor.</p>
    </div>
  );
}
