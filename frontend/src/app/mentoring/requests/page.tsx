"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { CalendarPlus, Check, Inbox, MessageSquare, X } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, EmptyState, Field, FlashAlerts, Loading, PageHeader, Select, Tabs, Textarea, type Flash } from "@/components/ui";
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
    <div className="well flex flex-col gap-3">
      <div className="font-semibold">Từ chối yêu cầu của {request.menteeName}</div>
      <Field label="Lý do" id={`reason-${request.id}`} required>
        <Select id={`reason-${request.id}`} value={reason} onChange={(e) => setReason(e.target.value as RejectReason | "")}>
          <option value="">Chọn lý do</option>
          {REJECT_REASONS.map((r) => <option key={r} value={r}>{REJECT_REASON_LABELS[r]}</option>)}
        </Select>
      </Field>
      <Field label="Ghi chú cho mentee" id={`note-${request.id}`} hint="Không bắt buộc.">
        <Textarea id={`note-${request.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]"
          placeholder="Gợi ý mentee tìm mentor chuyên về frontend" />
      </Field>
      <div className="form-actions">
        <Button size="sm" variant="danger" disabled={!reason} onClick={() => reason && onSubmit(reason, note.trim())}>Từ chối yêu cầu</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Huỷ</Button>
      </div>
    </div>
  );
}

function RequestDetails({ r, isMentor }: { r: MentoringRequest; isMentor: boolean }) {
  const note = (text: ReactNode) => <div className="text-small text-ink-muted">{text}</div>;
  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-wrap">{r.goal}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-small text-ink-muted">
        {r.sessionType && <span>{SESSION_TYPE_LABELS[r.sessionType]}</span>}
        <span>{FREQUENCY_LABELS[r.frequency] || r.frequency}</span>
        <span>{r.expectedDurationMonths} tháng</span>
      </div>
      {r.message && <blockquote className="well text-small">“{r.message}”</blockquote>}
      {isMentor && r.menteeProfile && note(<>
        Hồ sơ: {r.menteeProfile.domain}
        {r.menteeProfile.currentLevel && ` · ${LEVEL_LABELS[r.menteeProfile.currentLevel] || r.menteeProfile.currentLevel}`}
        {r.menteeProfile.skills.length > 0 && ` · Kỹ năng: ${r.menteeProfile.skills.join(", ")}`}
      </>)}
      {r.status === "REJECTED" && r.rejectReason && note(`Lý do từ chối: ${REJECT_REASON_LABELS[r.rejectReason]}`)}
      {r.responseNote && note(`Phản hồi: ${r.responseNote}`)}
      {r.status === "ACCEPTED" && r.inactivityWarnedAt && (
        <Alert tone="warning" title="Chưa có phiên mới từ lâu">
          Đặt một phiên trước {formatDateTime(new Date(new Date(r.inactivityWarnedAt).getTime() + 7 * 24 * 3600 * 1000).toISOString())}, nếu không mentoring sẽ tự kết thúc.
        </Alert>
      )}
      {(r.status === "ENDED" || r.status === "COMPLETED") && note(<>
        Đã kết thúc{r.endedAt && ` lúc ${formatDateTime(r.endedAt)}`}
        {r.endedBy && ` bởi ${r.endedBy === "MENTEE" ? "mentee" : r.endedBy === "MENTOR" ? "mentor" : r.endedBy === "ADMIN" ? "quản trị viên" : "hệ thống"}`}
        {r.endReason && ` · ${END_REASON_LABELS[r.endReason]}`}
        {r.endNote && ` · “${r.endNote}”`}
      </>)}
      {r.status === "EXPIRED" && note(<>
        {isMentor ? "Yêu cầu đã hết hạn vì bạn không phản hồi trong 72 giờ" : "Mentor không phản hồi trong 72 giờ nên yêu cầu đã hết hạn"}
        {r.expiredAt && ` (${formatDateTime(r.expiredAt)})`}.
      </>)}
    </div>
  );
}

type RequestTab = "pending" | "active" | "closed";
const tabOf = (r: MentoringRequest): RequestTab => (r.status === "PENDING" ? "pending" : r.status === "ACCEPTED" ? "active" : "closed");

function Requests({ user }: { user: SessionUser }) {
  const params = useSearchParams();
  const [items, setItems] = useState<MentoringRequest[] | undefined>(undefined);
  const [msg, setMsg] = useState<Flash>(params.get("sent") ? { ok: "Đã gửi yêu cầu mentoring. Mentor sẽ được thông báo." } : {});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [ending, setEnding] = useState<MentoringRequest | null>(null);
  const [tab, setTab] = useState<RequestTab>("pending");
  const isMentor = user.role === "MENTOR";
  const load = useCallback(
    () => mentoringApi.requests().then(setItems).catch((e) => { setItems((cur) => cur ?? []); setMsg({ error: errorMessage(e) }); }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  // US-41 (PRD-REV-4) — huy hiệu "Mentee đáng tin cậy" từ nhận xét riêng của các mentor trước, cho yêu cầu đang chờ.
  const [reliable, setReliable] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!isMentor || !items) return;
    const mentees = [...new Set(items.filter((r) => r.status === "PENDING").map((r) => r.menteeId))];
    mentees.forEach((id) => mentoringApi.menteeReliability(id)
      .then((res) => setReliable((cur) => ({ ...cur, [id]: res.badge === "RELIABLE" })))
      .catch(() => {}));
  }, [isMentor, items]);

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
  const count = (t: RequestTab) => items.filter((r) => tabOf(r) === t).length;
  const shown = items.filter((r) => tabOf(r) === tab);
  const emptyText: Record<RequestTab, string> = {
    pending: isMentor ? "Không có yêu cầu nào đang chờ bạn phản hồi." : "Bạn không có yêu cầu nào đang chờ mentor phản hồi.",
    active: "Chưa có mentoring nào đang diễn ra.",
    closed: "Chưa có yêu cầu nào đã kết thúc, bị từ chối hoặc hết hạn.",
  };
  return (
    <>
      <PageHeader
        title="Yêu cầu mentoring"
        description={isMentor ? "Mentee muốn được bạn hướng dẫn. Phản hồi trong 72 giờ, quá hạn yêu cầu tự hết hạn." : "Các yêu cầu bạn đã gửi tới mentor."}
        actions={!isMentor && <ButtonLink href="/matching" variant="primary">Tìm mentor</ButtonLink>}
      />
      {ending && (
        <EndMentorshipDialog request={ending} isMentor={isMentor} onClose={() => setEnding(null)}
          onEnded={() => { setEnding(null); setMsg({ ok: "Đã kết thúc mentoring. Các phiên sắp tới đã được huỷ theo chính sách huỷ." }); load(); }} />
      )}
      <FlashAlerts flash={msg} className="mb-6" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "pending", label: "Đang chờ", count: count("pending") },
        { id: "active", label: "Đang hoạt động", count: count("active") },
        { id: "closed", label: "Đã đóng", count: count("closed") },
      ]} />
      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={emptyText[tab]}
            action={!isMentor && tab === "pending" && <ButtonLink href="/matching" size="sm">Tìm mentor bằng AI</ButtonLink>} />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((r) => {
            const name = isMentor ? r.menteeName : r.mentorName;
            return (
              <Card as="article" key={r.id}>
                <div className="flex flex-col gap-4 p-5 max-sm:p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <Avatar name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isMentor ? <strong>{name}</strong> : <Link href={`/mentors/${r.mentorId}`} className="font-semibold">{name}</Link>}
                        <MentoringStatusBadge status={r.status} />
                        {isMentor && reliable[r.menteeId] && <Badge tone="accent" title="Các mentor trước đánh giá chuẩn bị và tham gia tốt">Mentee đáng tin cậy</Badge>}
                      </div>
                      <div className="text-small text-ink-subtle">Gửi lúc {formatDateTime(r.createdAt)}</div>
                    </div>
                  </div>
                  <RequestDetails r={r} isMentor={isMentor} />
                  {rejecting === r.id && (
                    <RejectForm request={r} onCancel={() => setRejecting(null)}
                      onSubmit={(reason, note) => act(() => mentoringApi.respond(r.id, "REJECT", note, reason), "Đã từ chối yêu cầu.")} />
                  )}
                </div>
                <div className="card-foot">
                  {r.status === "ACCEPTED" && <Button variant="danger-quiet" className="mr-auto" onClick={() => setEnding(r)}>Kết thúc mentoring</Button>}
                  {r.status !== "CANCELLED" && <ButtonLink href={`/messages/${r.id}`} icon={MessageSquare}>Nhắn tin</ButtonLink>}
                  {isMentor && r.status === "PENDING" && rejecting !== r.id && (
                    <>
                      <Button icon={X} onClick={() => setRejecting(r.id)}>Từ chối</Button>
                      <Button variant="primary" icon={Check} onClick={() => act(() => mentoringApi.respond(r.id, "ACCEPT", ""), "Đã chấp nhận yêu cầu.")}>Chấp nhận</Button>
                    </>
                  )}
                  {!isMentor && r.status === "PENDING" && (
                    <Button onClick={() => act(() => mentoringApi.cancelRequest(r.id), "Đã huỷ yêu cầu.")}>Huỷ yêu cầu</Button>
                  )}
                  {!isMentor && (r.status === "REJECTED" || r.status === "EXPIRED") && (
                    <ButtonLink href="/matching" variant="primary">Tìm mentor khác</ButtonLink>
                  )}
                  {!isMentor && r.status === "ACCEPTED" && <ButtonLink href={`/mentoring/book/${r.mentorId}`} variant="primary" icon={CalendarPlus}>Đặt lịch</ButtonLink>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
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
