"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, GraduationCap, Lock, MessageCircle, Quote, SlidersHorizontal, Wrench, X } from "lucide-react";
import { Alert, Avatar, Button, ButtonLink, Chip, Chips, DescriptionList, EmptyState, Modal, Radio, Stars } from "@/components/ui";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, domainLabel } from "@/features/profile/api";
import { Section } from "@/features/profile/ProfileParts";
import { mentoringApi } from "@/features/mentoring/api";
import { REJECT_REASONS, REJECT_REASON_LABELS } from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { MenteeExtras } from "./api";
import type { MenteeProfile, MentoringRequest, RejectReason } from "@/types";

const DAY_SHORT = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TIME_LABEL = { MORNING: "sáng", AFTERNOON: "chiều", EVENING: "tối" } as const;

/** Nút Chấp nhận / Nhắn tin / Từ chối khi mentor xem hồ sơ mentee đang gửi yêu cầu. */
export function RequestActions({ request, onDone }: { request: MentoringRequest; onDone: (r: MentoringRequest) => void }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<RejectReason>("SCHEDULE");
  const [error, setError] = useState("");

  const respond = async (decision: "ACCEPT" | "REJECT") => {
    setBusy(true);
    setError("");
    try {
      const r = await mentoringApi.respond(request.id, decision, "", decision === "REJECT" ? reason : undefined);
      setRejecting(false);
      onDone(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="primary" icon={Check} loading={busy && !rejecting} onClick={() => respond("ACCEPT")}>Chấp nhận yêu cầu</Button>
      <ButtonLink href="/messages" icon={MessageCircle}>Nhắn tin</ButtonLink>
      <Button icon={X} onClick={() => setRejecting(true)}>Từ chối</Button>
      {error && !rejecting && <span role="alert" className="text-small text-danger">{error}</span>}
      {rejecting && (
        <Modal title="Từ chối yêu cầu" onClose={() => setRejecting(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Huỷ</Button>
            <Button variant="danger" loading={busy} onClick={() => respond("REJECT")}>Từ chối yêu cầu</Button>
          </>}>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Lý do từ chối">
            <Alert>{error}</Alert>
            {REJECT_REASONS.map((r) => (
              <Radio key={r} name="reject-reason" label={REJECT_REASON_LABELS[r]} checked={reason === r} onChange={() => setReason(r)} />
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Kỹ năng chia "Đã có / Muốn học". */
export function SkillsSplit({ have, want }: { have: string[]; want: string[] }) {
  return (
    <Section id="ky-nang" icon={Wrench} title="Kỹ năng">
      <div className="pf-split">
        <div>
          <div className="eyebrow mb-2">Đã có</div>
          {have.length === 0 ? <p className="text-small text-ink-muted">Chưa khai báo.</p> : <Chips>{have.map((s) => <Chip key={s}>{s}</Chip>)}</Chips>}
        </div>
        <div>
          <div className="eyebrow mb-2">Muốn học</div>
          {want.length === 0 ? <p className="text-small text-ink-muted">Chưa khai báo.</p> : <Chips>{want.map((s) => <Chip key={s} selected>{s}</Chip>)}</Chips>}
        </div>
      </div>
    </Section>
  );
}

/** "Nhận xét từ mentor trước". */
export function MentorFeedbackSection({ extras }: { extras: MenteeExtras | null }) {
  return (
    <Section id="nhan-xet" icon={Quote} title="Nhận xét từ mentor trước">
      {extras === null ? <p className="text-small text-ink-muted">Đang tải…</p>
        : extras.feedbacks.length === 0 ? <EmptyState title="Chưa có nhận xét">Nhận xét xuất hiện sau khi mentor hoàn thành phiên với mentee này.</EmptyState>
        : (
          <div className="flex flex-col divide-y divide-border">
            {extras.feedbacks.map((f) => (
              <article key={f.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Avatar name={f.mentorName} size="sm" />
                  <div className="min-w-0">
                    <strong>{f.mentorName}</strong>
                    <div className="text-small text-ink-subtle">{f.period} · {SESSION_TYPE_LABELS[f.sessionType]}</div>
                  </div>
                  <span className="ml-auto"><Stars value={f.rating} /></span>
                </div>
                <p className="whitespace-pre-wrap">{f.comment}</p>
              </article>
            ))}
          </div>
        )}
    </Section>
  );
}

/** "Mong muốn về buổi học": lĩnh vực, loại phiên, ngân sách, ngôn ngữ, lịch hay rảnh. */
export function WishesSection({ mentee, extras }: { mentee: MenteeProfile; extras: MenteeExtras | null }) {
  const days = [...(mentee.preferredDays ?? [])].sort().map((d) => DAY_SHORT[d]).filter(Boolean).join(", ");
  const time = mentee.preferredTimeOfDay ? `buổi ${TIME_LABEL[mentee.preferredTimeOfDay]}` : "";
  const when = [days, time].filter(Boolean).join(" · ");
  const types = extras?.wantedSessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(", ");
  return (
    <Section icon={SlidersHorizontal} title="Mong muốn về buổi học">
      <DescriptionList items={[
        ["Lĩnh vực", domainLabel(mentee.domain)],
        ["Loại phiên", types || "Chưa chọn"],
        ["Ngân sách", mentee.budgetMaxPerHour ? `≤ ${formatMoney(mentee.budgetMaxPerHour)} / giờ` : "Không giới hạn"],
        ["Ngôn ngữ", mentee.languages?.length ? mentee.languages.map((l) => LANGUAGE_LABELS[l]).join(", ") : "Không giới hạn"],
        ["Hay rảnh", when || "Linh hoạt"],
      ]} />
    </Section>
  );
}

/** "Mentor đã học cùng". */
export function LearnedWithSection({ extras }: { extras: MenteeExtras | null }) {
  if (extras && extras.mentors.length === 0) return null;
  return (
    <Section icon={GraduationCap} title="Mentor đã học cùng">
      {extras === null ? <p className="text-small text-ink-muted">Đang tải…</p> : (
        <ul className="flex flex-col gap-4">
          {extras.mentors.map((m) => (
            <li key={m.mentorId} className="pf-rel">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{m.name}</div>
                <div className="text-small text-ink-muted">{m.headline} · {m.sessions} phiên</div>
                <Link href={`/mentors/${m.mentorId}`} className="pf-link-touch">Xem hồ sơ</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** "Quyền riêng tư" — Ai thấy gì? */
export function PrivacySection({ self }: { self: boolean }) {
  const rows: [string, string][] = [
    ["Mục tiêu, kỹ năng, mong muốn", "Mentor khi mentee gửi yêu cầu"],
    ["Bài viết đã đăng", "Mọi người"],
    ["Email, số điện thoại, CV", "Mentor đã chấp nhận yêu cầu"],
    ["Bản nháp bài viết", "Chỉ mình bạn"],
  ];
  return (
    <Section icon={Lock} title="Quyền riêng tư">
      <p className="text-small text-ink-muted">Email, số điện thoại và CV chỉ hiện sau khi mentor chấp nhận yêu cầu. Trước đó mentor chỉ thấy mục tiêu, kỹ năng và mong muốn.</p>
      <h3 className="eyebrow mt-4 mb-2">Ai thấy gì?</h3>
      <dl className="pf-who">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {self && <p className="mt-3 text-small"><Link href="/profile">Chỉnh sửa hồ sơ</Link></p>}
    </Section>
  );
}

