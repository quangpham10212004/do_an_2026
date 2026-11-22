"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CalendarOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Checkbox, Field, FlashAlerts, Input, Loading, Modal, type Flash } from "@/components/ui";
import { ConfirmModal } from "@/features/profile/editKit";
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

function ExceptionFields({ form, setForm, idPrefix }: { form: ExceptionForm; setForm: (f: ExceptionForm) => void; idPrefix: string }) {
  return (
    <>
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
      <Input id={`${idPrefix}-reason`} value={form.reason} maxLength={300} placeholder="Lý do (không bắt buộc)" aria-label="Lý do" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
    </>
  );
}

/**
 * US-07 (PRD-PROF-4) — mentor báo nghỉ cả ngày hoặc bận một khoảng giờ trong ngày cụ thể.
 * mentoring-service không cho đặt lịch mới vào các khoảng này; phiên đã xác nhận không tự huỷ.
 * Thêm: form gọn ngay trên mục; sửa: hộp thoại; xoá: hộp thoại xác nhận. Các thao tác gọi API ngay (không qua thanh lưu).
 */
export default function AvailabilityExceptions({ mentorId, onToast }: { mentorId: Uuid; onToast?: (text: string) => void }) {
  const [items, setItems] = useState<AvailabilityException[] | null>(null);
  const [form, setForm] = useState<ExceptionForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<ExceptionForm | null>(null);
  const [deleting, setDeleting] = useState<AvailabilityException | null>(null);
  const [msg, setMsg] = useState<Flash>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    profileApi.getExceptions(mentorId).then(setItems).catch((e: unknown) => {
      setItems([]);
      setMsg({ error: errorMessage(e) });
    });
  }, [mentorId]);

  async function submit(f: ExceptionForm, done: () => void, e?: FormEvent) {
    e?.preventDefault();
    if (!f.date) return setMsg({ error: "Chọn ngày nghỉ." });
    if (!f.wholeDay && f.startTime >= f.endTime) return setMsg({ error: "Giờ kết thúc phải sau giờ bắt đầu." });
    setBusy(true);
    setMsg({});
    setWarning(null);
    const body: AvailabilityExceptionInput = {
      date: f.date,
      startTime: f.wholeDay ? null : f.startTime,
      endTime: f.wholeDay ? null : f.endTime,
      reason: f.reason.trim() || null,
    };
    try {
      const res = f.id ? await profileApi.updateException(mentorId, f.id, body) : await profileApi.createException(mentorId, body);
      setItems(await profileApi.getExceptions(mentorId));
      done();
      setWarning(res.warning || null);
      onToast?.(f.id ? "Đã cập nhật ngày nghỉ" : "Đã thêm ngày nghỉ");
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: AvailabilityException) {
    setBusy(true);
    setMsg({});
    try {
      await profileApi.deleteException(mentorId, item.id);
      setItems((list) => (list || []).filter((x) => x.id !== item.id));
      setDeleting(null);
      setEditing(null);
      onToast?.(`Đã xoá ngày nghỉ ${formatLocalDate(item.date)}`);
    } catch (err) {
      setMsg({ error: errorMessage(err) });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  const edit = (item: AvailabilityException) => setEditing({
    id: item.id,
    date: item.date,
    wholeDay: !item.startTime,
    startTime: item.startTime || "09:00",
    endTime: item.endTime || "12:00",
    reason: item.reason || "",
  });

  return (
    <div className="flex flex-col gap-4">
      <FlashAlerts flash={msg} />
      {warning && (
        <Alert tone="warning" title="Ngày nghỉ này trùng phiên đã đặt"
          action={<Link href="/mentoring/sessions" className="btn btn-sm">Mở phiên học</Link>}>
          {warning} Phiên đó vẫn giữ nguyên; bạn cần đổi lịch hoặc huỷ phiên.
        </Alert>
      )}
      {items === null && <Loading />}
      {items?.length === 0 && (
        <div className="pe-empty">
          <CalendarOff aria-hidden="true" />
          <b>Chưa có ngày nghỉ nào sắp tới</b>
          <p>Thêm ngày nghỉ để mentee không đặt trúng giờ bạn bận.</p>
        </div>
      )}
      {!!items?.length && (
        <ul className="flex flex-col gap-2" aria-label="Ngày nghỉ sắp tới">
          {items.map((x) => (
            <li key={x.id} className="pe-linkrow">
              <div className="min-w-0 flex-1">
                <b className="tabular">{formatLocalDate(x.date)} · {exceptionTimeLabel(x)}</b>
                {x.reason && <div className="text-small text-ink-muted">{x.reason}</div>}
              </div>
              <Button variant="ghost" iconOnly icon={Pencil} label={`Sửa ngày nghỉ ${formatLocalDate(x.date)}`} onClick={() => edit(x)} />
              <Button variant="ghost" iconOnly icon={Trash2} label={`Xoá ngày nghỉ ${formatLocalDate(x.date)}`} onClick={() => setDeleting(x)} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => submit(form, () => setForm(EMPTY_FORM), e)} className="pe-addbox">
        <ExceptionFields form={form} setForm={setForm} idPrefix="ex-new" />
        <div><Button type="submit" icon={Plus} loading={busy}>Thêm ngày nghỉ</Button></div>
      </form>

      {editing && !deleting && (
        <Modal title="Sửa ngày nghỉ" width={520} onClose={() => setEditing(null)}
          footer={<>
            <Button variant="danger-quiet" icon={Trash2} className="mr-auto" onClick={() => { const it = items?.find((x) => x.id === editing.id); if (it) setDeleting(it); }}>Xoá</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Huỷ</Button>
            <Button variant="primary" loading={busy} onClick={() => submit(editing, () => setEditing(null))}>Lưu thay đổi</Button>
          </>}>
          <Field><div className="flex flex-col gap-3"><ExceptionFields form={editing} setForm={setEditing} idPrefix="ex-edit" /></div></Field>
        </Modal>
      )}
      {deleting && (
        <ConfirmModal title={`Xoá ngày nghỉ ${formatLocalDate(deleting.date)}?`} confirmText="Xoá ngày nghỉ" cancelText="Giữ lại" busy={busy}
          onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)}>
          <p className="text-ink-muted">Mentee có thể đặt phiên mới vào khoảng này trở lại.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
