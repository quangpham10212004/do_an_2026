"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Loading } from "@/components/ui";
import { DEFAULT_PREFS, NOTIF_CATEGORIES, notificationX, type NotificationPrefs } from "@/features/socialx/api";
import { errorMessage } from "@/lib/api";

const REMINDERS: { id: keyof NotificationPrefs["reminders"]; label: string }[] = [
  { id: "d1", label: "1 ngày" },
  { id: "h1", label: "1 giờ" },
  { id: "m30", label: "30 phút" },
];

/** Bảng "Cách nhận thông báo" và nhắc lịch trước phiên. Dữ liệu qua notificationX (mock lưu localStorage). */
export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saved, setSaved] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    notificationX.getPrefs().then((p) => { setPrefs(p); setSaved(p); }).catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  if (!prefs) return error ? <Alert>{error}</Alert> : <Loading />;
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  const setChannel = (id: keyof NotificationPrefs["channels"], key: "inApp" | "email", v: boolean) => {
    setOk("");
    setPrefs({ ...prefs, channels: { ...prefs.channels, [id]: { ...prefs.channels[id], [key]: v } } });
  };
  const setReminder = (id: keyof NotificationPrefs["reminders"], v: boolean) => {
    setOk("");
    setPrefs({ ...prefs, reminders: { ...prefs.reminders, [id]: v } });
  };

  async function save() {
    if (!prefs) return;
    setBusy(true);
    setError("");
    try {
      const res = await notificationX.savePrefs(prefs);
      setSaved(res);
      setPrefs(res);
      setOk("Đã lưu cài đặt thông báo.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sc-prefs" aria-labelledby="notif-prefs-title">
      <h2 id="notif-prefs-title">Cách nhận thông báo</h2>
      <Alert>{error}</Alert>
      <Alert tone="success">{ok}</Alert>
      <table className="sc-prefs-table">
        <thead>
          <tr><th scope="col">Loại thông báo</th><th scope="col">Trong app</th><th scope="col">Email</th></tr>
        </thead>
        <tbody>
          {NOTIF_CATEGORIES.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              <td><Checkbox label={<span className="sr-only">{c.label}: nhận trong app</span>} checked={prefs.channels[c.id].inApp} onChange={(e) => setChannel(c.id, "inApp", e.target.checked)} /></td>
              <td><Checkbox label={<span className="sr-only">{c.label}: nhận qua email</span>} checked={prefs.channels[c.id].email} onChange={(e) => setChannel(c.id, "email", e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sc-prefs-note">Thông báo bảo mật và thanh toán quan trọng luôn được gửi qua email.</p>
      <fieldset className="sc-remind">
        <legend>Nhắc lịch trước phiên</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {REMINDERS.map((r) => <Checkbox key={r.id} label={r.label} checked={prefs.reminders[r.id]} onChange={(e) => setReminder(r.id, e.target.checked)} />)}
        </div>
        <p className="sc-prefs-note">Giờ theo múi giờ GMT+7 của bạn.</p>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}>Lưu cài đặt</Button>
        <Button variant="ghost" disabled={busy || (!dirty && JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFS))} onClick={() => { setOk(""); setPrefs(DEFAULT_PREFS); }}>Về mặc định</Button>
      </div>
    </section>
  );
}
