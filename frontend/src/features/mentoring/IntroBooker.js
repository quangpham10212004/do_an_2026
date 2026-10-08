"use client";

import { useCallback, useState } from "react";
import { Alert } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { formatDateTime } from "@/lib/format";

/**
 * Đặt buổi làm quen cho yêu cầu đang ở giai đoạn INTRO: chọn một khung giờ còn trống của mentor
 * (buổi ngắn, miễn phí). `onBooked` nhận yêu cầu đã cập nhật (có thông tin buổi làm quen).
 */
export default function IntroBooker({ request, onBooked }) {
  const [slot, setSlot] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = useCallback((value) => setSlot(value), []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onBooked(await mentoringApi.bookIntro(request.id, slot));
    } catch (err) {
      setError(err.message);
      setVersion((v) => v + 1); // khung giờ có thể vừa bị đặt → tải lại
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ width: "100%" }}>
      <Alert>{error}</Alert>
      <div className="field">
        <label>Chọn giờ cho buổi làm quen {request.introDurationMinutes} phút <span className="muted small">(giờ Việt Nam, miễn phí)</span></label>
        <SlotPicker mentorId={request.mentorId} durationMinutes={request.introDurationMinutes} value={slot} onChange={pick} refreshKey={version} />
      </div>
      <button className="btn sm" disabled={busy || !slot}>
        {busy ? "Đang đặt..." : slot ? `Đặt lúc ${formatDateTime(slot)}` : "Chọn một khung giờ"}
      </button>
    </form>
  );
}
