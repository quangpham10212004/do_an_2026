"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { END_REASON_LABELS, END_REASONS } from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import type { EndReason, MentoringRequest } from "@/types";

/**
 * US-31 — hộp thoại "Kết thúc mentoring": chọn lý do (bắt buộc) + ghi chú ≤ 500 ký tự. Các phiên sắp tới của hai bên bị
 * huỷ theo chính sách huỷ như thể người kết thúc huỷ. Dùng ở /mentoring/requests (và trang quan hệ của Team B).
 */
export default function EndMentorshipDialog({ request, isMentor, onClose, onEnded }: {
  request: MentoringRequest;
  isMentor: boolean;
  onClose: () => void;
  onEnded: (r: MentoringRequest) => void;
}) {
  const [reason, setReason] = useState<Exclude<EndReason, "INACTIVE"> | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const other = isMentor ? request.menteeName : request.mentorName;

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="end-title" onSubmit={async (e) => {
        e.preventDefault();
        if (!reason) return setError("Vui lòng chọn lý do kết thúc.");
        setBusy(true);
        setError("");
        try {
          onEnded(await mentoringApi.endRequest(request.id, reason, note.trim() || undefined));
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}>
        <h2 id="end-title">Kết thúc mentoring với {other}?</h2>
        <p className="small">
          Các phiên sắp tới của hai bạn sẽ bị huỷ theo chính sách huỷ phiên
          {isMentor
            ? " (mentor huỷ: mentee được hoàn 100% và bạn bị ghi 1 lần vi phạm cho mỗi phiên)."
            : " (huỷ trước giờ bắt đầu dưới 72 giờ sẽ không được hoàn tiền)."}
          {" "}Mentor được giải phóng một chỗ; muốn học tiếp cần gửi yêu cầu mới.
        </p>
        <Alert>{error}</Alert>
        <div className="field">
          <label htmlFor={`end-reason-${request.id}`}>Lý do</label>
          <select id={`end-reason-${request.id}`} value={reason}
            onChange={(e) => setReason(e.target.value as Exclude<EndReason, "INACTIVE"> | "")}>
            <option value="">— Chọn lý do —</option>
            {END_REASONS.map((r) => <option key={r} value={r}>{END_REASON_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`end-note-${request.id}`}>Ghi chú (tuỳ chọn)</label>
          <textarea id={`end-note-${request.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row dialog-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Giữ mentoring</button>
          <button className="btn danger" disabled={busy}>Kết thúc mentoring</button>
        </div>
      </form>
    </div>
  );
}
