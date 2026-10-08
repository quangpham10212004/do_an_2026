"use client";

import { useCallback, useState } from "react";
import { Alert } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import SlotPicker from "@/features/mentoring/SlotPicker";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { IsoDateTime, MentoringRequest } from "@/types";

/**
 * Mentee đặt buổi làm quen (miễn phí, thời lượng cố định) cho yêu cầu mà mentor mời làm quen trước.
 * Khung giờ lấy từ /requests/{id}/intro-slots — cùng quy tắc lịch rảnh / buffer / báo trước như phiên thường.
 */
export default function IntroBooker({ request, onBooked }: { request: MentoringRequest; onBooked: () => void }) {
  const [value, setValue] = useState<IsoDateTime | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const loadSlots = useCallback(() => mentoringApi.introSlots(request.id), [request.id]);

  async function book() {
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await mentoringApi.bookIntro(request.id, value);
      onBooked();
    } catch (e) {
      setError(errorMessage(e));
      setRefreshKey((k) => k + 1); // khung giờ có thể vừa bị người khác đặt
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8, width: "100%" }}>
      <strong className="small">Chọn giờ cho buổi làm quen với {request.mentorName}</strong>
      <span className="muted small">Buổi trò chuyện ngắn, miễn phí. Sau buổi này cả hai bên quyết định có làm việc cùng nhau hay không.</span>
      <SlotPicker mentorId={request.mentorId} durationMinutes={15} value={value} onChange={setValue}
        refreshKey={refreshKey} loadSlots={loadSlots} />
      <Alert>{error}</Alert>
      <div className="row">
        <button className="btn sm" disabled={!value || busy} onClick={book}>
          {busy ? "Đang đặt..." : value ? `Đặt buổi làm quen lúc ${formatDateTime(value)}` : "Chọn một khung giờ"}
        </button>
      </div>
    </div>
  );
}
