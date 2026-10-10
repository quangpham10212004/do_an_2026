"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Alert, Button, Chip, Chips, Textarea } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { REVIEW_SUBSCORES, REVIEW_TAG_LABELS } from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import type { Review, StructuredReviewInput, Uuid } from "@/types";

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3" role="radiogroup" aria-label={label}>
      <span className="w-24 text-small text-ink-muted">{label}</span>
      <span className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={n === value} aria-label={`${n} sao`}
            className="grid size-7 cursor-pointer place-items-center rounded-sm hover:bg-surface-hover" onClick={() => onChange(n)}>
            <Star aria-hidden="true" fill="currentColor" strokeWidth={0} className={`size-5 ${n <= value ? "" : "off"}`} />
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * US-41 (PRD-REV-2) — đánh giá có cấu trúc: tổng + kiến thức / truyền đạt / chuẩn bị, thẻ, nhận xét (bắt buộc ≥ 20 ký tự
 * khi ≤ 2 sao). existing = sửa đánh giá trong 48 giờ.
 */
export default function ReviewForm({ sessionId, existing, onDone }: { sessionId: Uuid; existing?: Review; onDone: () => void }) {
  const [form, setForm] = useState<StructuredReviewInput>({
    rating: existing?.rating ?? 5,
    knowledge: existing?.knowledge ?? 5,
    clarity: existing?.clarity ?? 5,
    preparation: existing?.preparation ?? 5,
    comment: existing?.comment ?? "",
    tags: existing?.tags ?? [],
  });
  const [error, setError] = useState("");
  const needComment = form.rating <= 2;
  const toggle = (t: string) =>
    setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t].slice(0, 5) }));
  return (
    <form className="well mt-2 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const body = { ...form, comment: form.comment?.trim() || undefined };
          await (existing ? mentoringApi.updateReview(sessionId, body) : mentoringApi.review(sessionId, body));
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}>
      <Alert>{error}</Alert>
      <StarPicker label="Tổng thể" value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
      {REVIEW_SUBSCORES.map(([key, label]) => (
        <StarPicker key={key} label={label} value={form[key]} onChange={(n) => setForm({ ...form, [key]: n })} />
      ))}
      <Chips>
        {Object.entries(REVIEW_TAG_LABELS).map(([code, label]) => (
          <Chip key={code} selected={form.tags.includes(code)} onClick={() => toggle(code)}>{label}</Chip>
        ))}
      </Chips>
      <Textarea value={form.comment} maxLength={2000} className="min-h-[72px]" aria-label="Nhận xét" onChange={(e) => setForm({ ...form, comment: e.target.value })}
        placeholder={needComment ? "Cho biết điều chưa tốt (ít nhất 20 ký tự)" : "Nhận xét về buổi mentoring (không bắt buộc)"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-ink-muted">{existing ? "Sửa được trong 48 giờ sau khi đăng." : "Đánh giá trong 14 ngày sau phiên; sửa được trong 48 giờ."}</span>
        <Button type="submit" variant="primary" size="sm" disabled={needComment && (form.comment?.trim().length ?? 0) < 20}>{existing ? "Lưu thay đổi" : "Gửi đánh giá"}</Button>
      </div>
    </form>
  );
}

/** US-41 (PRD-REV-4) — mentor nhận xét riêng về mentee (không công khai). */
export function MenteeFeedbackForm({ sessionId, onDone }: { sessionId: Uuid; onDone: (msg: string) => void }) {
  const [prep, setPrep] = useState(4);
  const [engage, setEngage] = useState(4);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="well mt-2 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await mentoringApi.menteeFeedback(sessionId, prep, engage, comment.trim() || undefined);
          onDone("Đã lưu nhận xét riêng về mentee.");
        } catch (err) {
          setError(errorMessage(err));
        }
      }}>
      <Alert>{error}</Alert>
      <StarPicker label="Chuẩn bị" value={prep} onChange={setPrep} />
      <StarPicker label="Tham gia" value={engage} onChange={setEngage} />
      <Textarea value={comment} maxLength={1000} className="min-h-[64px]" aria-label="Ghi chú" onChange={(e) => setComment(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-ink-muted">Không công khai; chỉ dùng tổng hợp thành huy hiệu “Mentee đáng tin cậy”.</span>
        <Button type="submit" size="sm" variant="primary">Lưu nhận xét</Button>
      </div>
    </form>
  );
}
