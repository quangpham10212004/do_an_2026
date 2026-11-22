"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { CalendarPlus, Check, Inbox, MessageSquare } from "lucide-react";
import { Alert, Button, ButtonLink, Card, EmptyState, FlashAlerts, Loading, Tabs, Textarea, type Flash } from "@/components/ui";
import EndMentorshipDialog from "@/features/mentoring/EndMentorshipDialog";
import { FlowHead, FlowMini, FlowPill, FlowTile } from "@/features/mentoring/FlowKit";
import { mentoringApi } from "@/features/mentoring/api";
import {
  END_REASON_LABELS,
  FREQUENCY_LABELS,
  LEVEL_LABELS,
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  SESSION_TYPE_LABELS,
} from "@/features/mentoring/labels";
import { profileApi } from "@/features/profile/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MentorProfile, MentoringRequest, RejectReason, SessionUser } from "@/types";

/** Mentor có 72 giờ để phản hồi (backend US-15); bản thiết kế ghi 48 giờ. */
const RESPONSE_HOURS = 72;
const HOUR = 3_600_000;

const hoursLeft = (r: MentoringRequest) => Math.max(Math.ceil((new Date(r.createdAt).getTime() + RESPONSE_HOURS * HOUR - Date.now()) / HOUR), 0);
const elapsedPct = (r: MentoringRequest) => Math.min(Math.max(((Date.now() - new Date(r.createdAt).getTime()) / (RESPONSE_HOURS * HOUR)) * 100, 4), 100);

function ago(iso: string): string {
  const mins = Math.max(Math.round((Date.now() - new Date(iso).getTime()) / 60_000), 0);
  if (mins < 60) return `${Math.max(mins, 1)} phút trước`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} giờ trước`;
  return `${Math.floor(mins / (24 * 60))} ngày trước`;
}

const STATUS_PILL: Record<string, { label: string; tone?: "success" | "warning" | "danger" | "info" }> = {
  PENDING: { label: "Đang chờ mentor", tone: "warning" },
  ACCEPTED: { label: "Đã chấp nhận", tone: "success" },
  REJECTED: { label: "Đã từ chối", tone: "danger" },
  EXPIRED: { label: "Hết hạn" },
  CANCELLED: { label: "Đã rút" },
  ENDED: { label: "Đã kết thúc" },
  COMPLETED: { label: "Hoàn thành", tone: "success" },
};

/** Hết hạn: ≤ 6 giờ đỏ, còn lại hổ phách. */
function DeadlinePill({ r }: { r: MentoringRequest }) {
  const h = hoursLeft(r);
  return <FlowPill tone={h <= 6 ? "danger" : "warning"}>{h > 0 ? `Còn ${h} giờ` : "Sắp hết hạn"}</FlowPill>;
}

/** US-14 (PRD-REQ-2) — mentor chọn lý do từ chối (bắt buộc) + ghi chú tuỳ chọn; hiện ở cột phụ như hộp thoại. */
function RejectDialog({ request, onSubmit, onCancel }: {
  request: MentoringRequest;
  onSubmit: (reason: RejectReason, note: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ref.current?.focus();
  }, []);
  return (
    <section ref={ref} tabIndex={-1} role="dialog" aria-label="Từ chối yêu cầu" className="fl-dialog"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="fl-eyebrow" style={{ marginBottom: 0 }}>Từ chối yêu cầu</div>
      <h2>Từ chối yêu cầu của {request.menteeName}?</h2>
      <div role="radiogroup" aria-label="Lý do" className="fl-opts" style={{ marginTop: 14 }}>
        {REJECT_REASONS.map((x) => (
          <label key={x} className="fl-opt" data-checked={reason === x}>
            <input type="radio" name={`reason-${request.id}`} checked={reason === x} onChange={() => setReason(x)} />
            {REJECT_REASON_LABELS[x]}
          </label>
        ))}
      </div>
      <label className="fl-group" style={{ marginTop: 14, gap: 6, fontSize: 13, fontWeight: 600 }}>
        <span>Ghi chú cho mentee <span style={{ fontWeight: 400, color: "var(--ink-subtle)" }}>(không bắt buộc)</span></span>
        <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)}
          placeholder="Gợi ý mentee tìm mentor chuyên về frontend" />
      </label>
      <div className="fl-actions">
        <Button onClick={onCancel}>Huỷ</Button>
        <Button variant="danger" disabled={!reason} onClick={() => reason && onSubmit(reason, note.trim())}>Từ chối yêu cầu</Button>
      </div>
    </section>
  );
}

function RequestDetails({ r, isMentor }: { r: MentoringRequest; isMentor: boolean }) {
  const note = (text: ReactNode) => <div className="text-small text-ink-muted">{text}</div>;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="fl-label">Mục tiêu</div>
        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed">{r.goal}</p>
      </div>
      <div className="fl-facts">
        {r.sessionType && <span>Loại phiên: <b>{SESSION_TYPE_LABELS[r.sessionType]}</b></span>}
        <span>Tần suất: <b>{FREQUENCY_LABELS[r.frequency] || r.frequency}</b></span>
        <span>Dự kiến: <b>{r.expectedDurationMonths} tháng</b></span>
      </div>
      {r.message && <div className="fl-quote"><b>Lời nhắn:</b> {r.message}</div>}
      {isMentor && r.menteeProfile && note(<>
        Hồ sơ: {r.menteeProfile.domain}
        {r.menteeProfile.currentLevel && ` · ${LEVEL_LABELS[r.menteeProfile.currentLevel] || r.menteeProfile.currentLevel}`}
        {r.menteeProfile.skills.length > 0 && ` · Kỹ năng: ${r.menteeProfile.skills.join(", ")}`}
      </>)}
      {r.status === "REJECTED" && r.rejectReason && note(`Lý do từ chối: ${REJECT_REASON_LABELS[r.rejectReason]}`)}
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
        {isMentor ? `Yêu cầu đã hết hạn vì bạn không phản hồi trong ${RESPONSE_HOURS} giờ` : `Mentor không phản hồi trong ${RESPONSE_HOURS} giờ nên yêu cầu đã hết hạn`}
        {r.expiredAt && ` (${formatDateTime(r.expiredAt)})`}.
      </>)}
    </div>
  );
}

type MentorTab = "pending" | "accepted" | "rejected" | "expired";
type MenteeTab = "all" | "pending" | "accepted" | "failed";

const mentorTabOf = (r: MentoringRequest): MentorTab =>
  r.status === "PENDING" ? "pending" : r.status === "REJECTED" ? "rejected" : r.status === "EXPIRED" || r.status === "CANCELLED" ? "expired" : "accepted";
const menteeTabOf = (r: MentoringRequest): Exclude<MenteeTab, "all"> =>
  r.status === "PENDING" ? "pending" : r.status === "REJECTED" || r.status === "EXPIRED" || r.status === "CANCELLED" ? "failed" : "accepted";

function Requests({ user }: { user: SessionUser }) {
  const params = useSearchParams();
  const isMentor = user.role === "MENTOR";
  const [items, setItems] = useState<MentoringRequest[] | undefined>(undefined);
  const [msg, setMsg] = useState<Flash>(params.get("sent") ? { ok: "Đã gửi yêu cầu mentoring. Mentor sẽ được thông báo." } : {});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [ending, setEnding] = useState<MentoringRequest | null>(null);
  const [tab, setTab] = useState<MentorTab | MenteeTab>(isMentor ? "pending" : "all");
  /** undefined = mở thẻ đầu tiên; null = thu gọn hết. */
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const load = useCallback(
    () => mentoringApi.requests().then(setItems).catch((e) => { setItems((cur) => cur ?? []); setMsg({ error: errorMessage(e) }); }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  // Hồ sơ của chính mentor: số chỗ trống + kỹ năng để hiện "Khớp với bạn".
  const [self, setSelf] = useState<MentorProfile | null>(null);
  useEffect(() => {
    if (isMentor) profileApi.getMentor(user.userId).then(setSelf).catch(() => {});
  }, [isMentor, user.userId]);

  // US-41 (PRD-REV-4) — huy hiệu "Mentee đáng tin cậy" từ nhận xét riêng của các mentor trước, cho yêu cầu đang chờ.
  const [reliable, setReliable] = useState<Record<string, { badge: boolean; count: number }>>({});
  useEffect(() => {
    if (!isMentor || !items) return;
    const mentees = [...new Set(items.filter((r) => r.status === "PENDING").map((r) => r.menteeId))];
    mentees.forEach((id) => mentoringApi.menteeReliability(id)
      .then((res) => setReliable((cur) => ({ ...cur, [id]: { badge: res.badge === "RELIABLE", count: res.feedbackCount } })))
      .catch(() => {}));
  }, [isMentor, items]);

  // Mentee: thời gian phản hồi thường gặp của mentor cho yêu cầu đang chờ.
  const [medians, setMedians] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (isMentor || !items) return;
    const mentors = [...new Set(items.filter((r) => r.status === "PENDING").map((r) => r.mentorId))];
    mentors.forEach((id) => profileApi.getMentor(id)
      .then((m) => setMedians((cur) => ({ ...cur, [id]: m.medianResponseHours })))
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

  const tabOf = (r: MentoringRequest) => (isMentor ? mentorTabOf(r) : menteeTabOf(r));
  const count = (t: string) => (t === "all" ? items.length : items.filter((r) => tabOf(r) === t).length);
  const tabs = isMentor
    ? [
        { id: "pending", label: "Chờ trả lời", count: count("pending") },
        { id: "accepted", label: "Đã chấp nhận", count: count("accepted") },
        { id: "rejected", label: "Đã từ chối", count: count("rejected") },
        { id: "expired", label: "Hết hạn", count: count("expired") },
      ]
    : [
        { id: "all", label: "Tất cả", count: count("all") },
        { id: "pending", label: "Đang chờ", count: count("pending") },
        { id: "accepted", label: "Đã chấp nhận", count: count("accepted") },
        { id: "failed", label: "Không thành công", count: count("failed") },
      ];
  const shown = tab === "all" ? items : items.filter((r) => tabOf(r) === tab);
  const expandedId = openId === undefined ? (isMentor ? shown[0]?.id : null) : openId;
  const emptyText: Record<string, string> = {
    all: "Bạn chưa gửi yêu cầu nào.",
    pending: isMentor ? "Không có yêu cầu nào đang chờ bạn phản hồi." : "Bạn không có yêu cầu nào đang chờ mentor phản hồi.",
    accepted: "Chưa có mentoring nào được chấp nhận.",
    rejected: "Bạn chưa từ chối yêu cầu nào.",
    expired: "Chưa có yêu cầu nào hết hạn.",
    failed: "Chưa có yêu cầu nào bị từ chối hoặc hết hạn.",
  };
  const rejectingReq = rejecting ? items.find((r) => r.id === rejecting) : undefined;
  const slotsLeft = self ? Math.max(self.capacity - self.activeMenteeCount, 0) : null;

  const mentorCard = (r: MentoringRequest, index: number) => {
    const open = expandedId === r.id;
    const rel = reliable[r.menteeId];
    const pill = STATUS_PILL[r.status];
    const matches = self && r.menteeProfile ? r.menteeProfile.skills.filter((s) => self.skills.some((k) => k.toLowerCase() === s.toLowerCase())) : [];
    const sub = [
      r.menteeProfile?.currentLevel && (LEVEL_LABELS[r.menteeProfile.currentLevel] || r.menteeProfile.currentLevel),
      r.menteeProfile?.domain,
      `gửi ${ago(r.createdAt)}`,
      rel && rel.count > 0 && `${rel.count} nhận xét từ mentor trước`,
    ].filter(Boolean).join(" · ");
    const status = r.status === "PENDING" ? <DeadlinePill r={r} /> : pill && <FlowPill tone={pill.tone}>{pill.label}</FlowPill>;
    return (
      <article key={r.id} className="fl-req" data-open={open} aria-label={`Yêu cầu của ${r.menteeName}`}>
        <div className="fl-req-top">
          <FlowTile name={r.menteeName} size={open ? undefined : "sm"} tone={open ? "1" : index % 2 ? "2" : "1"} />
          <div className="fl-req-name">
            <div className="fl-req-badges">
              <b>{r.menteeName}</b>
              {rel?.badge && <FlowPill tone="success">Mentee đáng tin cậy</FlowPill>}
              {status}
            </div>
            {open
              ? <div className="fl-req-sub">{sub}</div>
              : <div className="fl-req-sub fl-req-line">{r.goal}</div>}
          </div>
          {open ? (
            <>
              <Link href={`/mentees/${r.menteeId}`} className="fl-link">Xem hồ sơ →</Link>
              <Button variant="ghost" aria-expanded onClick={() => setOpenId(null)}>Thu gọn</Button>
            </>
          ) : (
            <Button aria-expanded={false} onClick={() => setOpenId(r.id)}>Xem chi tiết</Button>
          )}
        </div>
        {open && (
          <>
            <div className="fl-req-body">
              <RequestDetails r={r} isMentor />
              {matches.length > 0 && (
                <div className="fl-match">
                  <span>Khớp với bạn:</span>
                  {matches.map((s) => <span key={s} className="fl-m">{s}</span>)}
                </div>
              )}
            </div>
            <div className="fl-req-foot">
              {r.status === "PENDING" && (
                <>
                  <Button variant="primary" size="lg" icon={Check} onClick={() => act(() => mentoringApi.respond(r.id, "ACCEPT", ""), "Đã chấp nhận yêu cầu.")}>Chấp nhận</Button>
                  <Button onClick={() => setRejecting(r.id)}>Từ chối…</Button>
                </>
              )}
              {r.status === "ACCEPTED" && <Button variant="danger-quiet" onClick={() => setEnding(r)}>Kết thúc mentoring</Button>}
              {r.status !== "CANCELLED" && (
                <ButtonLink className="fl-push" variant="ghost" href={`/messages/${r.id}`} icon={MessageSquare}>
                  {r.status === "PENDING" ? "Nhắn tin trước" : "Nhắn tin"}
                </ButtonLink>
              )}
            </div>
          </>
        )}
      </article>
    );
  };

  const menteeCard = (r: MentoringRequest) => {
    const pill = STATUS_PILL[r.status];
    const open = expandedId === r.id;
    const accepted = r.status === "ACCEPTED";
    const median = medians[r.mentorId];
    const sub =
      r.status === "PENDING" ? `Gửi ${ago(r.createdAt)} · hết hạn sau ${hoursLeft(r)} giờ`
      : accepted ? `Gửi ${ago(r.createdAt)}${r.respondedAt ? ` · mentor phản hồi ${ago(r.respondedAt)}` : ""}`
      : r.status === "REJECTED" ? (r.rejectReason ? `Lý do: ${REJECT_REASON_LABELS[r.rejectReason].toLowerCase()}` : "Mentor đã từ chối yêu cầu")
      : r.status === "EXPIRED" ? `Mentor chưa phản hồi trong ${RESPONSE_HOURS} giờ`
      : r.status === "CANCELLED" ? "Bạn đã rút yêu cầu này"
      : `Gửi lúc ${formatDateTime(r.createdAt)}`;
    return (
      <article key={r.id} className="fl-req" data-open={accepted} aria-label={`Yêu cầu tới ${r.mentorName}`}>
        <div className="fl-req-top">
          <FlowTile name={r.mentorName} tone={accepted ? undefined : r.status === "PENDING" ? "1" : "muted"} />
          <div className="fl-req-name">
            <div className="fl-req-badges">
              <Link href={`/mentors/${r.mentorId}`} className="font-bold" style={{ fontSize: 17 }}>{r.mentorName}</Link>
              {pill && <FlowPill tone={pill.tone}>{pill.label}</FlowPill>}
            </div>
            <div className="fl-req-sub">{sub}</div>
          </div>
          {accepted && <ButtonLink href={`/mentoring/book/${r.mentorId}`} variant="primary" size="lg" icon={CalendarPlus}>Đặt lịch ngay</ButtonLink>}
          {r.status === "PENDING" && <Button onClick={() => act(() => mentoringApi.cancelRequest(r.id), "Đã huỷ yêu cầu.")}>Rút yêu cầu</Button>}
          {r.status === "REJECTED" && <ButtonLink href="/matching" variant="primary">Tìm mentor khác</ButtonLink>}
          {(r.status === "EXPIRED" || r.status === "CANCELLED") && <ButtonLink href={`/mentoring/request/${r.mentorId}`} variant="primary">Gửi lại</ButtonLink>}
        </div>
        <div className="fl-req-body">
          {accepted && <FlowMini current={2} />}
          {accepted && r.responseNote && <div className="fl-quote" style={{ background: "var(--accent-soft)" }}><b>Mentor nhắn:</b> {r.responseNote}</div>}
          {r.status === "PENDING" && (
            <div>
              <div className="fl-bar" role="progressbar" aria-label="Thời gian chờ mentor phản hồi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsedPct(r))}>
                <span style={{ width: `${elapsedPct(r)}%` }} />
              </div>
              {median != null && <div className="fl-bar-note">Mentor thường trả lời trong {median < 1 ? "dưới 1" : Math.round(median)} giờ</div>}
            </div>
          )}
          {r.status === "REJECTED" && r.responseNote && <div className="fl-quote"><b>Ghi chú từ mentor:</b> {r.responseNote}</div>}
          {open && <RequestDetails r={r} isMentor={false} />}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>{open ? "Thu gọn" : "Xem chi tiết"}</Button>
            {r.status !== "CANCELLED" && <ButtonLink variant="ghost" href={`/messages/${r.id}`} icon={MessageSquare}>Nhắn tin</ButtonLink>}
            {accepted && <Button variant="danger-quiet" onClick={() => setEnding(r)}>Kết thúc mentoring</Button>}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="fl-page">
      <FlowHead
        title={isMentor ? "Yêu cầu mentoring" : "Yêu cầu của tôi"}
        lead={isMentor
          ? `Trả lời trong ${RESPONSE_HOURS} giờ để không bỏ lỡ mentee.${slotsLeft != null ? ` Còn ${slotsLeft} chỗ trống.` : ""}`
          : "Theo dõi các yêu cầu bạn đã gửi tới mentor."}
        actions={!isMentor && <ButtonLink href="/matching" variant="primary" size="lg">Tìm mentor</ButtonLink>}
      />
      {ending && (
        <EndMentorshipDialog request={ending} isMentor={isMentor} onClose={() => setEnding(null)}
          onEnded={() => { setEnding(null); setMsg({ ok: "Đã kết thúc mentoring. Các phiên sắp tới đã được huỷ theo chính sách huỷ." }); load(); }} />
      )}
      <FlashAlerts flash={msg} className="mb-4" />
      <Tabs className="fl-tabs" value={tab} onChange={(t) => { setTab(t); setOpenId(undefined); }} tabs={tabs as { id: MentorTab | MenteeTab; label: string; count: number }[]} />
      <div className="fl-layout" style={{ marginTop: 20 }}>
        <main className="fl-main" style={{ gap: 16 }} aria-label="Danh sách yêu cầu">
          {shown.length === 0 ? (
            <Card>
              <EmptyState icon={Inbox} title={emptyText[tab]}
                action={!isMentor && (tab === "all" || tab === "pending") && <ButtonLink href="/matching" size="sm">Tìm mentor bằng AI</ButtonLink>} />
            </Card>
          ) : (
            <div className="fl-list">
              {shown.map((r, i) => (isMentor ? mentorCard(r, i) : menteeCard(r)))}
            </div>
          )}
        </main>
        {isMentor && (
          <aside className="fl-aside" aria-label="Hướng dẫn">
            {rejectingReq && (
              <RejectDialog key={rejectingReq.id} request={rejectingReq} onCancel={() => setRejecting(null)}
                onSubmit={(reason, note) => act(() => mentoringApi.respond(rejectingReq.id, "REJECT", note, reason), "Đã từ chối yêu cầu.")} />
            )}
            <section className="fl-note">
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--accent-ink)" }}>Sau khi bạn chấp nhận</h2>
              <p style={{ margin: "8px 0 0" }}>Mentee nhận thông báo và chọn khung giờ trong lịch rảnh của bạn. Bạn xác nhận từng phiên sau khi mentee thanh toán.</p>
            </section>
            <section className="fl-note fl-note-warn">
              <b>Yêu cầu quá {RESPONSE_HOURS} giờ tự hết hạn</b>
              <p style={{ margin: "6px 0 0" }}>Hết hạn nhiều lần sẽ làm giảm mức ưu tiên hiển thị của bạn trong gợi ý.</p>
            </section>
          </aside>
        )}
      </div>
    </div>
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
