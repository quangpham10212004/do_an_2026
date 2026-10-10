"use client";

import { useEffect, useState } from "react";
import { Alert, Card, CardBody, CardHeader, FlashAlerts, Loading } from "@/components/ui";
import { authApi, type NotificationPreferences } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";

const CATEGORIES: [keyof NotificationPreferences, string, string][] = [
  ["requests", "Yêu cầu mentoring", "Yêu cầu mới, được chấp nhận, hết hạn"],
  ["sessions", "Phiên học", "Xác nhận, huỷ, đề xuất dời lịch, nhắc lịch 24 giờ / 1 giờ, xác nhận tham dự"],
  ["messages", "Tin nhắn", "Gộp các tin chưa đọc sau 30 phút"],
  ["reviews", "Đánh giá", "Thông báo về đánh giá"],
  ["marketing", "Tin tức & ưu đãi", "Mặc định tắt"],
];

/** US-38 (PRD-NOTI-1, NOTI-4) — bật/tắt email theo nhóm + giờ yên tĩnh. Email bảo mật luôn được gửi. */
export default function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    authApi.notificationPreferences().then(setPrefs).catch((e) => setMsg({ error: errorMessage(e) }));
  }, []);

  if (!prefs) return msg.error ? <Alert>{msg.error}</Alert> : <Loading />;

  const save = async (next: NotificationPreferences) => {
    setPrefs(next);
    setMsg({});
    try {
      setPrefs(await authApi.saveNotificationPreferences(next));
      setMsg({ ok: "Đã lưu tuỳ chọn email." });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  };

  const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) => (
    <label className="flex cursor-pointer items-start gap-3 py-3">
      <input type="checkbox" className="mt-1 size-4 flex-none accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-small text-ink-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <Card>
      <div id="notifications" />
      <CardHeader title="Email thông báo" description="Email bảo mật (xác thực, đặt lại mật khẩu) và kết quả xét duyệt mentor luôn được gửi." />
      <CardBody className="flex flex-col">
        <FlashAlerts flash={msg} className="mb-2" />
        <div className="flex flex-col divide-y divide-border">
          {CATEGORIES.map(([key, label, hint]) => (
            <Toggle key={key} label={label} hint={hint} checked={Boolean(prefs[key])} onChange={(v) => save({ ...prefs, [key]: v })} />
          ))}
          <Toggle
            label={`Giờ yên tĩnh ${prefs.quietStart || "22:00"}–${prefs.quietEnd || "07:00"}`}
            hint="Email trong khung này được gửi lúc 07:00 (theo múi giờ trong hồ sơ), trừ nhắc lịch của phiên bắt đầu trong khung giờ đó."
            checked={prefs.quietHours}
            onChange={(v) => save({ ...prefs, quietHours: v })}
          />
        </div>
      </CardBody>
    </Card>
  );
}
