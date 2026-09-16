"use client";

import { useEffect, useMemo, useState } from "react";
import { mentoringApi } from "@/features/mentoring/api";

const DAYS = 14;

function dayKey(date, timeZone) {
  // en-CA cho dạng YYYY-MM-DD, dùng làm khoá nhóm theo ngày ở múi giờ của nền tảng
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Bộ chọn khung giờ đặt lịch (FR-5.4): hiển thị 14 ngày tới, chỉ cho chọn thời điểm mentoring-service
 * báo còn trống (trong lịch rảnh, không trùng phiên của mentor hoặc của chính mentee).
 * `value` là startAt (ISO) đang chọn; đổi `refreshKey` để tải lại sau khi đặt lịch thất bại.
 */
export default function SlotPicker({ mentorId, durationMinutes, value, onChange, refreshKey }) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState("");
  const [day, setDay] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError("");
    mentoringApi.availableSlots(mentorId, durationMinutes, DAYS)
      .then((d) => !cancelled && setData(d))
      .catch((e) => { if (!cancelled) { setError(e.message); setData(null); } });
    return () => { cancelled = true; };
  }, [mentorId, durationMinutes, refreshKey]);

  const timeZone = data?.timezone || "Asia/Ho_Chi_Minh";
  const { days, byDay } = useMemo(() => {
    const byDay = {};
    for (const slot of data?.slots || []) {
      (byDay[dayKey(new Date(slot.startAt), timeZone)] ||= []).push(slot);
    }
    const now = Date.now();
    const days = Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(now + i * 86400000);
      return {
        key: dayKey(date, timeZone),
        weekday: date.toLocaleDateString("vi-VN", { timeZone, weekday: "short" }),
        label: date.toLocaleDateString("vi-VN", { timeZone, day: "numeric", month: "numeric" }),
      };
    });
    return { days, byDay };
  }, [data, timeZone]);

  // Giữ ngày đang chọn nếu còn slot, nếu không chuyển sang ngày sớm nhất còn trống; bỏ chọn giờ không còn hợp lệ
  useEffect(() => {
    if (!data) return;
    const current = day && byDay[day] ? day : days.find((d) => byDay[d.key])?.key || null;
    if (current !== day) setDay(current);
    if (value && !data.slots.some((s) => s.startAt === value)) onChange(null);
  }, [data, byDay, days, day, value, onChange]);

  if (data === undefined) return <p className="muted small">Đang tải lịch trống của mentor...</p>;
  if (error) return <div className="alert error">{error}</div>;
  if (data.slots.length === 0) {
    return <div className="alert info">Mentor không còn khung giờ trống cho phiên {durationMinutes} phút trong {DAYS} ngày tới. Hãy thử thời lượng ngắn hơn.</div>;
  }

  const times = byDay[day] || [];
  const timeLabel = (iso) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone, hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <div className="slot-days" role="group" aria-label="Chọn ngày">
        {days.map((d) => (
          <button key={d.key} type="button" className="slot-day" aria-pressed={d.key === day}
            disabled={!byDay[d.key]} onClick={() => setDay(d.key)}>
            {d.weekday}<small>{d.label}</small>
          </button>
        ))}
      </div>
      <div className="slot-times" role="group" aria-label="Chọn giờ bắt đầu">
        {times.map((s) => (
          <button key={s.startAt} type="button" className="slot-time" aria-pressed={s.startAt === value}
            onClick={() => onChange(s.startAt)} title={`${timeLabel(s.startAt)} – ${timeLabel(s.endAt)}`}>
            {timeLabel(s.startAt)}
          </button>
        ))}
      </div>
    </div>
  );
}
