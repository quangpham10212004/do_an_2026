"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Flash } from "@/components/ui";
import EndMentorshipDialog from "@/features/mentoring/EndMentorshipDialog";
import { mentoringApi } from "@/features/mentoring/api";
import {
  END_REASON_LABELS,
  FREQUENCY_LABELS,
  LEVEL_LABELS,
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  SESSION_TYPE_LABELS,
} from "@/features/mentoring/labels";
import MentoringStatusBadge from "@/features/mentoring/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MentoringRequest, RejectReason, SessionUser } from "@/types";

/** US-14 (PRD-REQ-2) — mentor chọn lý do từ chối (bắt buộc) + ghi chú tuỳ chọn. */
function RejectForm({ request, onSubmit, onCancel }: {
  request: MentoringRequest;
  onSubmit: (reason: RejectReason, note: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  return (
    <div className="card stack" style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8, width: "100%" }}>
      <strong className="small">Từ chối yêu cầu của {request.menteeName}</strong>
      <div className="field">
        <label htmlFor={`reason-${request.id}`}>Lý do <span className="muted small">(bắt buộc)</span></label>
        <select id={`reason-${request.id}`} value={reason} onChange={(e) => setReason(e.target.value as RejectReason | "")}>
          <option value="">— Chọn lý do —</option>
          {REJECT_REASONS.map((r) => <option key={r} value={r}>{REJECT_REASON_LABELS[r]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`note-${request.id}`}>Ghi chú cho mentee <span className="muted small">(tuỳ chọn)</span></label>
        <textarea id={`note-${request.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: gợi ý mentee tìm mentor chuyên về frontend" />
      </div>
      <div className="row">
        <button className="btn danger sm" disabled={!reason} onClick={() => reason && onSubmit(reason, note.trim())}>Từ chối</button>
        <button className="btn secondary sm" onClick={onCancel}>Thôi</button>
      </div>
    </div>
  );
}

function RequestDetails({ r, isMentor }: { r: MentoringRequest; isMentor: boolean }) {
  return (
    <>
      <div className="small" style={{ whiteSpace: "pre-wrap" }}><strong>Mục tiêu:</strong> {r.goal}</div>
      <div className="small muted">
        {r.sessionType && `${SESSION_TYPE_LABELS[r.sessionType]} · `}
        {FREQUENCY_LABELS[r.frequency] || r.frequency} · {r.expectedDurationMonths} tháng
      </div>
      {r.message && <div className="small">“{r.message}”</div>}
      {isMentor && r.menteeProfile && (
        <div className="small muted">
          Hồ sơ: {r.menteeProfile.domain}
          {r.menteeProfile.currentLevel && ` · ${LEVEL_LABELS[r.menteeProfile.currentLevel] || r.menteeProfile.currentLevel}`}
          {r.menteeProfile.skills.length > 0 && ` · Kỹ năng: ${r.menteeProfile.skills.join(", ")}`}
        </div>
      )}
      {r.status === "REJECTED" && r.rejectReason && (
        <div className="small muted">Lý do từ chối: {REJECT_REASON_LABELS[r.rejectReason]}</div>
      )}
      {r.responseNote && <div className="small muted">Phản hồi: {r.responseNote}</div>}
      {r.status === "ACCEPTED" && r.inactivityWarnedAt && (
        <div className="small"><strong>Chưa có phiên mới từ lâu — bạn có muốn tiếp tục?</strong> Hãy đặt một phiên trước{" "}
          {formatDateTime(new Date(new Date(r.inactivityWarnedAt).getTime() + 7 * 24 * 3600 * 1000).toISOString())}, nếu không mentoring sẽ tự kết thúc.</div>
      )}
      {(r.status === "ENDED" || r.status === "COMPLETED") && (
        <div className="small muted">
          Đã kết thúc{r.endedAt && ` lúc ${formatDateTime(r.endedAt)}`}
          {r.endedBy && ` bởi ${r.endedBy === "MENTEE" ? "mentee" : r.endedBy === "MENTOR" ? "mentor" : r.endedBy === "ADMIN" ? "quản trị viên" : "hệ thống"}`}
          {r.endReason && ` · ${END_REASON_LABELS[r.endReason]}`}
          {r.endNote && ` · “${r.endNote}”`}
        </div>
      )}
      {r.status === "EXPIRED" && (
        <div className="small muted">
          {isMentor ? "Yêu cầu đã hết hạn vì bạn không phản hồi trong 72 giờ" : "Mentor không phản hồi trong 72 giờ nên yêu cầu đã hết hạn"}
          {r.expiredAt && ` (${formatDateTime(r.expiredAt)})`}.
        </div>
      )}
    </>
  );
}

function Requests({ user }: { user: SessionUser }) {
  const params = useSearchParams();
  const [items, setItems] = useState<MentoringRequest[] | undefined>(undefined);
  const [msg, setMsg] = useState<Flash>(params.get("sent") ? { ok: "Đã gửi yêu cầu mentoring. Mentor sẽ được thông báo." } : {});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [ending, setEnding] = useState<MentoringRequest | null>(null);
  const isMentor = user.role === "MENTOR";
  const load = useCallback(
    () => mentoringApi.requests().then(setItems).catch((e) => { setItems((cur) => cur ?? []); setMsg({ error: errorMessage(e) }); }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      setRejecting(null);
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  if (items === undefined) return <Loading />;
  return (
    <>
      <PageHead title="Yêu cầu mentoring" subtitle={isMentor ? "Mentee gửi yêu cầu được bạn hướng dẫn." : "Các yêu cầu bạn đã gửi tới mentor."}>
        {!isMentor && <Link className="btn" href="/mentors">Tìm mentor</Link>}
      </PageHead>
      {ending && (
        <EndMentorshipDialog request={ending} isMentor={isMentor} onClose={() => setEnding(null)}
          onEnded={() => { setEnding(null); setMsg({ ok: "Đã kết thúc mentoring. Các phiên sắp tới đã được huỷ theo chính sách huỷ." }); load(); }} />
      )}
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="card">
        {items.length === 0 && (
          <Empty>
            Chưa có yêu cầu nào.
            {!isMentor && <> <Link href="/mentors">Duyệt danh sách mentor</Link> hoặc dùng <Link href="/matching">AI Matching</Link> để bắt đầu.</>}
          </Empty>
        )}
        {items.map((r) => (
          <div className="list-item" key={r.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="row" style={{ width: "100%" }}>
              <div style={{ flex: 1 }}>
                <div className="row">
                  <strong>{isMentor ? r.menteeName : <Link href={`/mentors/${r.mentorId}`}>{r.mentorName}</Link>}</strong>
                  <MentoringStatusBadge status={r.status} />
                  <span className="muted small">{formatDateTime(r.createdAt)}</span>
                </div>
                <RequestDetails r={r} isMentor={isMentor} />
              </div>
              <div className="row">
                {isMentor && r.status === "PENDING" && (
                  <>
                    <button className="btn good sm" onClick={() => act(() => mentoringApi.respond(r.id, "ACCEPT", ""), "Đã chấp nhận yêu cầu")}>Chấp nhận</button>
                    <button className="btn danger sm" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>Từ chối</button>
                  </>
                )}
                {!isMentor && r.status === "PENDING" && (
                  <button className="btn secondary sm" onClick={() => act(() => mentoringApi.cancelRequest(r.id), "Đã huỷ yêu cầu")}>Huỷ</button>
                )}
                {!isMentor && (r.status === "REJECTED" || r.status === "EXPIRED") && (
                  <Link className="btn secondary sm" href="/matching">Tìm mentor khác</Link>
                )}
                {!isMentor && r.status === "ACCEPTED" && <Link className="btn sm" href={`/mentoring/book/${r.mentorId}`}>Đặt lịch</Link>}
                {r.status !== "CANCELLED" && <Link className="btn secondary sm" href={`/messages/${r.id}`}>Nhắn tin</Link>}
                {r.status === "ACCEPTED" && (
                  <button className="btn secondary sm" onClick={() => setEnding(r)}>Kết thúc mentoring</button>
                )}
              </div>
            </div>
            {rejecting === r.id && (
              <RejectForm request={r} onCancel={() => setRejecting(null)}
                onSubmit={(reason, note) => act(() => mentoringApi.respond(r.id, "REJECT", note, reason), "Đã từ chối yêu cầu")} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function RequestsPage() {
  return (
    <RequireAuth roles={["MENTEE", "MENTOR"]}>
      {(user) => (
        <Suspense>
          <Requests user={user} />
        </Suspense>
      )}
    </RequireAuth>
  );
}
