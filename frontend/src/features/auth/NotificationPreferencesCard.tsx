"use client";

import { useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";
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

  return (
    <div className="card stack" id="notifications">
      <h2>Email thông báo</h2>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      {CATEGORIES.map(([key, label, hint]) => (
        <label key={key} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={Boolean(prefs[key])} onChange={(e) => save({ ...prefs, [key]: e.target.checked })} />
          <span><strong>{label}</strong><br /><span className="small muted">{hint}</span></span>
        </label>
      ))}
      <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={prefs.quietHours} onChange={(e) => save({ ...prefs, quietHours: e.target.checked })} />
        <span>
          <strong>Giờ yên tĩnh {prefs.quietStart || "22:00"}–{prefs.quietEnd || "07:00"}</strong><br />
          <span className="small muted">Email trong khung này được gửi lúc 07:00 (theo múi giờ trong hồ sơ), trừ nhắc lịch của phiên bắt đầu trong khung giờ đó.</span>
        </span>
      </label>
      <div className="small muted">Email bảo mật (xác thực, đặt lại mật khẩu) và kết quả xét duyệt mentor luôn được gửi.</div>
    </div>
  );
}
