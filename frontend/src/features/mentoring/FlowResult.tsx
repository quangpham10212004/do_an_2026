"use client";

import { Check, X } from "lucide-react";
import { ButtonLink, Button } from "@/components/ui";
import { FlowTile } from "@/features/mentoring/FlowKit";
import { SESSION_TYPE_LABELS } from "@/features/mentoring/labels";
import { formatMoney, getDisplayTimeZone } from "@/lib/format";
import type { MentoringSession } from "@/types";

/** Khung kết quả của màn hình hoàn tất: tone success | danger | pending. */
export function FlowResult({ tone = "success", title, lead, children }: {
  tone?: "success" | "danger" | "pending";
  title: string;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="fl-result" data-tone={tone === "danger" ? "danger" : undefined} role={tone === "danger" ? "alert" : "status"}>
      <div className="fl-result-top" style={tone === "pending" ? { background: "none" } : undefined}>
        {tone === "pending" ? <div className="fl-spin" aria-hidden="true" /> : (
          <div className="fl-badge" data-tone={tone === "danger" ? "danger" : undefined} aria-hidden="true">{tone === "danger" ? <X /> : <Check />}</div>
        )}
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="fl-result-body">{children}</div>}
    </section>
  );
}

function rangeLabel(s: MentoringSession): string {
  const timeZone = getDisplayTimeZone();
  const start = new Date(s.scheduledAt);
  const end = new Date(s.endsAt || start.getTime() + s.durationMinutes * 60_000);
  const day = start.toLocaleDateString("vi-VN", { timeZone, weekday: "long", day: "2-digit", month: "2-digit" });
  const hm = (d: Date) => d.toLocaleTimeString("vi-VN", { timeZone, hour: "2-digit", minute: "2-digit" });
  return `${day} · ${hm(start)} – ${hm(end)}`;
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Tải tệp .ics để thêm buổi học vào lịch cá nhân. */
function downloadIcs(s: MentoringSession) {
  const end = new Date(s.endsAt || new Date(s.scheduledAt).getTime() + s.durationMinutes * 60_000);
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MentorHub//VI", "BEGIN:VEVENT",
    `UID:${s.id}@mentorhub`, `DTSTAMP:${icsStamp(new Date())}`, `DTSTART:${icsStamp(new Date(s.scheduledAt))}`, `DTEND:${icsStamp(end)}`,
    `SUMMARY:Phiên mentoring với ${s.mentorName}`, `DESCRIPTION:${(s.agenda || s.topic || "").replace(/\r?\n/g, " ")}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "phien-mentoring.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Màn hình "Đã đặt lịch thành công" sau khi học phí được tạm giữ. */
export function BookedResult({ session, amount, receiptId }: { session: MentoringSession; amount: number; receiptId?: string | null }) {
  const kind = session.sessionType ? SESSION_TYPE_LABELS[session.sessionType] : session.kind === "TRIAL" ? "Buổi trải nghiệm" : "Phiên mentoring";
  return (
    <FlowResult title="Đã đặt lịch thành công"
      lead={`Đã tạm giữ ${formatMoney(amount)}. Mentor xác nhận trong 24 giờ và chỉ nhận tiền sau khi buổi học hoàn thành.`}>
      <div className="fl-session">
        <FlowTile name={session.mentorName} />
        <div className="min-w-0">
          <b>{kind} với {session.mentorName}</b>
          <div className="fl-req-sub">{rangeLabel(session)}</div>
        </div>
      </div>
      <ButtonLink href={`/mentoring/sessions/${session.id}`} variant="primary" size="lg" className="fl-block">Xem chi tiết phiên học</ButtonLink>
      <div className="fl-btnrow">
        <Button onClick={() => downloadIcs(session)}>Thêm vào lịch</Button>
        {receiptId && <ButtonLink href={`/payment/receipts/${receiptId}`}>Xem biên lai</ButtonLink>}
      </div>
      <div className="fl-quote"><b>Tiếp theo:</b> chuẩn bị tài liệu đọc trước và nhắn tin với mentor nếu cần. Đổi lịch được bất kỳ lúc nào trước giờ bắt đầu.</div>
    </FlowResult>
  );
}
