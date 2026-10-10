"use client";

import { useState } from "react";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import {
  DISPUTE_DESCRIPTION_MAX,
  DISPUTE_DESCRIPTION_MIN,
  DISPUTE_MAX_LINKS,
  DISPUTE_OPENABLE,
  DISPUTE_TYPE_LABELS,
  DISPUTE_TYPES,
  DISPUTE_WINDOW_MS,
} from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import type { DisputeType, MentoringSession } from "@/types";

/** US-32 — phiên còn mở "Báo cáo sự cố" được: đã diễn ra, trong 7 ngày sau giờ kết thúc, chưa có tranh chấp đang mở. */
export function canReportIssue(s: MentoringSession, now = Date.now()): boolean {
  if (!DISPUTE_OPENABLE.includes(s.status)) return false;
  if (s.dispute && s.dispute.status !== "RESOLVED") return false;
  return now <= new Date(s.endsAt).getTime() + DISPUTE_WINDOW_MS;
}

/** US-32 — form "Báo cáo sự cố" cho mentee / mentor của phiên. */
export default function DisputeForm({ session, onDone, onCancel }: {
  session: MentoringSession;
  onDone: (ok: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<DisputeType>("QUALITY");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const paid = Number(session.price) > 0;
  const evidence = links.split("\n").map((l) => l.trim()).filter(Boolean);
  const len = description.trim().length;

  return (
    <form
      className="well flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (len < DISPUTE_DESCRIPTION_MIN) return setError(`Mô tả cần ít nhất ${DISPUTE_DESCRIPTION_MIN} ký tự.`);
        if (evidence.length > DISPUTE_MAX_LINKS) return setError(`Tối đa ${DISPUTE_MAX_LINKS} link bằng chứng.`);
        if (evidence.some((l) => !l.startsWith("https://"))) return setError("Link bằng chứng phải bắt đầu bằng https://");
        setBusy(true);
        try {
          await mentoringApi.openDispute(session.id, { type, description: description.trim(), evidenceLinks: evidence });
          onDone(paid
            ? "Đã gửi báo cáo sự cố. Khoản thanh toán của phiên được tạm giữ cho tới khi quản trị viên xử lý (phản hồi trong 48 giờ)."
            : "Đã gửi báo cáo sự cố. Quản trị viên sẽ phản hồi trong 48 giờ.");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <div className="font-semibold">Báo cáo sự cố</div>
        <p className="text-small text-ink-muted">
          Gửi trong 7 ngày sau khi phiên kết thúc. {paid && "Khoản thanh toán được tạm giữ cho tới khi quản trị viên kết luận."}
        </p>
      </div>
      <Alert>{error}</Alert>
      <Field label="Loại sự cố" id={`dispute-type-${session.id}`}>
        <Select id={`dispute-type-${session.id}`} value={type} onChange={(e) => setType(e.target.value as DisputeType)}>
          {DISPUTE_TYPES.map((t) => <option key={t} value={t}>{DISPUTE_TYPE_LABELS[t]}</option>)}
        </Select>
      </Field>
      <Field label="Mô tả" id={`dispute-desc-${session.id}`} hint={`${len}/${DISPUTE_DESCRIPTION_MAX} ký tự, tối thiểu ${DISPUTE_DESCRIPTION_MIN}.`}>
        <Textarea id={`dispute-desc-${session.id}`} value={description} maxLength={DISPUTE_DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Điều gì đã xảy ra? Thời điểm, diễn biến, ảnh hưởng tới bạn…" />
      </Field>
      <Field label="Link bằng chứng" id={`dispute-links-${session.id}`} hint={`Không bắt buộc. Tối đa ${DISPUTE_MAX_LINKS} link https, mỗi dòng một link.`}>
        <Textarea id={`dispute-links-${session.id}`} value={links} onChange={(e) => setLinks(e.target.value)}
          className="min-h-[64px] font-mono text-small" placeholder="https://drive.google.com/…" />
      </Field>
      <div className="form-actions">
        <Button type="submit" variant="danger" loading={busy}>Gửi báo cáo</Button>
        <Button variant="ghost" onClick={onCancel}>Huỷ</Button>
      </div>
    </form>
  );
}
