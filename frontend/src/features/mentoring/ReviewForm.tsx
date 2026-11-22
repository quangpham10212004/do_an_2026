"use client";

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import { Alert, Button, Checkbox, Chip, Chips, Textarea } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { REVIEW_SUBSCORES, REVIEW_TAG_LABELS } from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import type { Review, StructuredReviewInput, Uuid } from "@/types";

const RATING_WORDS = ["", "Rất tệ", "Chưa tốt", "Tạm được", "Tốt", "Xuất sắc"];
/** Nhãn điểm tổng thể của thiết kế SesReview. */
const SUBSCORE_LABELS: Record<string, string> = { knowledge: "Kiến thức chuyên môn", clarity: "Giải thích dễ hiểu", preparation: "Đúng giờ và chuẩn bị" };

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3" role="radiogroup" aria-label={label}>
      <span className="w-40 flex-none text-small text-ink-muted">{label}</span>
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
export default function ReviewForm({ sessionId, existing, onDone, skipHref }: { sessionId: Uuid; existing?: Review; onDone: () => void; skipHref?: string }) {
  const [form, setForm] = useState<StructuredReviewInput>({
    rating: existing?.rating ?? 5,
    knowledge: existing?.knowledge ?? 5,
    clarity: existing?.clarity ?? 5,
    preparation: existing?.preparation ?? 5,
    comment: existing?.comment ?? "",
    tags: existing?.tags ?? [],
  });
  const [error, setError] = useState("");
  const [showName, setShowName] = useState(existing?.showName ?? true);
  const needComment = form.rating <= 2;
  const toggle = (t: string) =>
    setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t].slice(0, 5) }));
  return (
    <form className="well mt-2 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const body = { ...form, comment: form.comment?.trim() || undefined, showName };
          await (existing ? mentoringApi.updateReview(sessionId, body) : mentoringApi.review(sessionId, body));
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}>
      <Alert>{error}</Alert>
      <div className="ses-rate-hero">
        <h3>Bạn thấy buổi học thế nào?</h3>
        <div className="ses-rate-big">
          <div className="stars" role="radiogroup" aria-label="Đánh giá tổng thể">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={n === form.rating} aria-label={`${n} sao`}
                className="grid cursor-pointer place-items-center rounded-sm hover:bg-surface-hover" onClick={() => setForm({ ...form, rating: n })}>
                <Star aria-hidden="true" fill="currentColor" strokeWidth={0} className={n <= form.rating ? "" : "off"} />
              </button>
            ))}
          </div>
          <span className="ses-rate-label" aria-live="polite">{RATING_WORDS[form.rating]} · {form.rating}/5</span>
        </div>
      </div>
      {REVIEW_SUBSCORES.map(([key, label]) => (
        <StarPicker key={key} label={SUBSCORE_LABELS[key] ?? label} value={form[key]} onChange={(n) => setForm({ ...form, [key]: n })} />
      ))}
      <div className="eyebrow">Điều bạn thích</div>
      <Chips>
        {Object.entries(REVIEW_TAG_LABELS).map(([code, label]) => (
          <Chip key={code} selected={form.tags.includes(code)} onClick={() => toggle(code)}>{label}</Chip>
        ))}
      </Chips>
      <Textarea value={form.comment} maxLength={2000} className="min-h-[96px]" aria-label="Nhận xét" onChange={(e) => setForm({ ...form, comment: e.target.value })}
        placeholder={needComment ? "Cho biết điều chưa tốt (ít nhất 20 ký tự)" : "Nhận xét về buổi mentoring (không bắt buộc)"} />
      <span className="ses-counter tabular" aria-live="off">{(form.comment ?? "").length} / 2000</span>
      <Checkbox label="Hiện tên của tôi trong đánh giá công khai" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-ink-muted">{existing ? "Sửa được trong 48 giờ sau khi đăng." : "Đánh giá trong 14 ngày sau phiên; sửa được trong 48 giờ."}</span>
        <div className="flex flex-wrap items-center gap-2">
          {skipHref && <Link href={skipHref} className="inline-flex min-h-[44px] items-center px-3 font-semibold text-ink-muted">Để sau</Link>}
          <Button type="submit" variant="primary" disabled={needComment && (form.comment?.trim().length ?? 0) < 20}>{existing ? "Lưu thay đổi" : "Gửi đánh giá"}</Button>
        </div>
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
      <label className="text-small font-semibold" htmlFor="mf-note">Ghi chú <span className="font-normal text-ink-muted">(không bắt buộc)</span></label>
      <Textarea id="mf-note" value={comment} maxLength={1000} className="min-h-[80px]" aria-label="Ghi chú" onChange={(e) => setComment(e.target.value)} placeholder="Ghi chú (chỉ mentor khác thấy khi mentee gửi yêu cầu, mentee không thấy)" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-ink-muted">Không công khai. Mentee xem điểm và nhận xét này trong mục Tiến độ của mình; điểm còn tổng hợp thành huy hiệu “Mentee đáng tin cậy”.</span>
        <Button type="submit" size="sm" variant="primary">Lưu nhận xét</Button>
      </div>
    </form>
  );
}
