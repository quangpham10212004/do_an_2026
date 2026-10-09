"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { REVIEW_SUBSCORES, REVIEW_TAG_LABELS } from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import type { Review, StructuredReviewInput, Uuid } from "@/types";

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label={label}>
      <span className="small" style={{ minWidth: 90 }}>{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} aria-label={`${n} sao`} className="btn ghost sm"
          style={{ fontSize: "1.2rem", padding: 0, color: "#f59f00" }} onClick={() => onChange(n)}>
          {n <= value ? "★" : "☆"}
        </button>
      ))}
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
    <form className="card stack" style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8 }}
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
      <div className="chips">
        {Object.entries(REVIEW_TAG_LABELS).map(([code, label]) => (
          <button type="button" key={code} className={`chip ${form.tags.includes(code) ? "match" : ""}`} onClick={() => toggle(code)}>{label}</button>
        ))}
      </div>
      <textarea value={form.comment} maxLength={2000} style={{ minHeight: 70 }} onChange={(e) => setForm({ ...form, comment: e.target.value })}
        placeholder={needComment ? "Hãy cho biết điều chưa tốt (ít nhất 20 ký tự)" : "Nhận xét về buổi mentoring (tuỳ chọn)"} />
      <div className="row between">
        <span className="small muted">{existing ? "Sửa được trong 48 giờ sau khi đăng." : "Đánh giá trong 14 ngày sau phiên; sửa được trong 48 giờ."}</span>
        <button className="btn sm" disabled={needComment && (form.comment?.trim().length ?? 0) < 20}>{existing ? "Lưu thay đổi" : "Gửi đánh giá"}</button>
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
    <form className="card stack" style={{ background: "var(--surface-2)", boxShadow: "none", marginTop: 8 }}
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
      <textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" />
      <div className="row between">
        <span className="small muted">Không công khai; chỉ dùng tổng hợp thành huy hiệu “Mentee đáng tin cậy”.</span>
        <button className="btn sm">Lưu nhận xét</button>
      </div>
    </form>
  );
}
