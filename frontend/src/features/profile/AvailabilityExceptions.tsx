"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, type Flash } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { exceptionTimeLabel, formatLocalDate, profileApi } from "@/features/profile/api";
import type { AvailabilityException, AvailabilityExceptionInput, Uuid } from "@/types";

interface ExceptionForm {
  id: Uuid | null;
  date: string;
  wholeDay: boolean;
  startTime: string;
  endTime: string;
  reason: string;
}

const todayIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const EMPTY_FORM: ExceptionForm = { id: null, date: "", wholeDay: true, startTime: "09:00", endTime: "12:00", reason: "" };

/**
 * US-07 (PRD-PROF-4) — mentor báo nghỉ cả ngày hoặc bận một khoảng giờ trong ngày cụ thể.
 * mentoring-service không cho đặt lịch mới vào các khoảng này; phiên đã xác nhận không tự huỷ.
 */
export default function AvailabilityExceptions({ mentorId }: { mentorId: Uuid }) {
  const [items, setItems] = useState<AvailabilityException[] | null>(null);
  const [form, setForm] = useState<ExceptionForm>(EMPTY_FORM);
  const [msg, setMsg] = useState<Flash>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    profileApi.getExceptions(mentorId).then(setItems).catch((e: unknown) => {
      setItems([]);
      setMsg({ error: errorMessage(e) });
    });
  }, [mentorId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    const body: AvailabilityExceptionInput = {
      date: form.date,
      startTime: form.wholeDay ? null : form.startTime,
      endTime: form.wholeDay ? null : form.endTime,
      reason: form.reason.trim() || null,
    };
    try {
      const res = form.id
        ? await profileApi.updateException(mentorId, form.id, body)
        : await profileApi.createException(mentorId, body);
      setItems(await profileApi.getExceptions(mentorId));
      setForm(EMPTY_FORM);
      setMsg({ ok: form.id ? "Đã cập nhật ngoại lệ." : "Đã thêm ngoại lệ.", info: res.warning || undefined });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: AvailabilityException) {
    setMsg({});
    try {
      await profileApi.deleteException(mentorId, item.id);
      setItems((list) => (list || []).filter((x) => x.id !== item.id));
      if (form.id === item.id) setForm(EMPTY_FORM);
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  function edit(item: AvailabilityException) {
    setForm({
      id: item.id,
      date: item.date,
      wholeDay: !item.startTime,
      startTime: item.startTime || "09:00",
      endTime: item.endTime || "12:00",
      reason: item.reason || "",
    });
  }

  return (
    <div>
      <h3>Ngày nghỉ / bận đột xuất</h3>
      <p className="muted small">Mentee sẽ không đặt được phiên mới vào các khoảng này. Phiên đã xác nhận không tự huỷ.</p>
      <Alert type="success">{msg.ok}</Alert>
      <Alert type="warn">{msg.info}</Alert>
      <Alert>{msg.error}</Alert>
      {items === null && <p className="muted small">Đang tải...</p>}
      {items?.length === 0 && <p className="muted small">Chưa có ngoại lệ nào sắp tới.</p>}
      {items?.map((x) => (
        <div key={x.id} className="row between small list-item">
          <span>
            <strong>{formatLocalDate(x.date)}</strong> · {exceptionTimeLabel(x)}
            {x.reason && <span className="muted"> — {x.reason}</span>}
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn ghost sm" onClick={() => edit(x)}>Sửa</button>
            <button type="button" className="btn ghost sm" onClick={() => remove(x)}>Xoá</button>
          </span>
        </div>
      ))}
      <form onSubmit={submit} style={{ marginTop: "0.75rem" }}>
        <div className="slot-row">
          <input type="date" required min={todayIso()} value={form.date} aria-label="Ngày" onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <label className="small row" style={{ gap: 4 }}>
            <input type="checkbox" checked={form.wholeDay} onChange={(e) => setForm({ ...form, wholeDay: e.target.checked })} /> Cả ngày
          </label>
          {!form.wholeDay && (
            <>
              <input type="time" required value={form.startTime} aria-label="Từ giờ" onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <input type="time" required value={form.endTime} aria-label="Đến giờ" onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </>
          )}
        </div>
        <div className="field">
          <input value={form.reason} maxLength={300} placeholder="Lý do (tuỳ chọn)" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn secondary sm" disabled={busy}>{form.id ? "Lưu thay đổi" : "+ Thêm ngoại lệ"}</button>
          {form.id && <button type="button" className="btn ghost sm" onClick={() => setForm(EMPTY_FORM)}>Huỷ sửa</button>}
        </div>
      </form>
    </div>
  );
}
