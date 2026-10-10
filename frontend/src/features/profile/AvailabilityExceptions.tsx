"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Checkbox, EmptyState, FlashAlerts, Input, List, ListRow, Loading, type Flash } from "@/components/ui";
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
    <Card>
      <CardHeader title="Ngày nghỉ và giờ bận đột xuất" description="Mentee không đặt được phiên mới vào các khoảng này. Phiên đã xác nhận không tự huỷ." />
      {items === null && <Loading />}
      {items?.length === 0 && <EmptyState title="Chưa có ngày nghỉ nào sắp tới">Thêm ngày nghỉ bên dưới khi bạn bận.</EmptyState>}
      {!!items?.length && (
        <List>
          {items.map((x) => (
            <ListRow
              key={x.id}
              title={<span className="tabular">{formatLocalDate(x.date)} · {exceptionTimeLabel(x)}</span>}
              meta={x.reason || undefined}
              trailing={<>
                <Button size="sm" variant="ghost" iconOnly icon={Pencil} label="Sửa" onClick={() => edit(x)} />
                <Button size="sm" variant="ghost" iconOnly icon={Trash2} label="Xoá" onClick={() => remove(x)} />
              </>}
            />
          ))}
        </List>
      )}
      <CardBody className="flex flex-col gap-3 border-t border-border">
        <FlashAlerts flash={{ ok: msg.ok, error: msg.error }} />
        {msg.info && <FlashAlerts flash={{ info: msg.info }} />}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input type="date" required min={todayIso()} value={form.date} aria-label="Ngày" className="w-auto" onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Checkbox label="Cả ngày" checked={form.wholeDay} onChange={(e) => setForm({ ...form, wholeDay: e.target.checked })} />
            {!form.wholeDay && (
              <>
                <Input type="time" required value={form.startTime} aria-label="Từ giờ" className="w-auto" onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                <span className="text-ink-muted">đến</span>
                <Input type="time" required value={form.endTime} aria-label="Đến giờ" className="w-auto" onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </>
            )}
          </div>
          <Input value={form.reason} maxLength={300} placeholder="Lý do (không bắt buộc)" aria-label="Lý do" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <div className="form-actions">
            <Button type="submit" icon={form.id ? undefined : Plus} loading={busy}>{form.id ? "Lưu thay đổi" : "Thêm ngày nghỉ"}</Button>
            {form.id && <Button variant="ghost" onClick={() => setForm(EMPTY_FORM)}>Huỷ sửa</Button>}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
