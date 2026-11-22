"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Card, CardHeader, Chip, Chips, EmptyState, Stars, Textarea } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import ReviewForm from "@/features/mentoring/ReviewForm";
import { REVIEW_SUBSCORES, REVIEW_TAG_LABELS } from "@/features/mentoring/labels";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MentorReviewSummary, Review, Uuid } from "@/types";

function ReplyForm({ review, onDone }: { review: Review; onDone: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2">
      <Alert>{error}</Alert>
      <Textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} className="min-h-[64px]"
        aria-label="Phản hồi đánh giá" placeholder="Phản hồi công khai (một lần, tối đa 500 ký tự)" />
      <div>
        <Button size="sm" disabled={!text.trim()} onClick={async () => {
          try {
            await mentoringApi.replyReview(review.id, text.trim());
            onDone();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}>Gửi phản hồi</Button>
      </div>
    </div>
  );
}

/**
 * US-41 (PRD-REV-3/5) — khối đánh giá trên trang mentor: điểm Bayes chỉ khi ≥ 3 đánh giá ("Mentor mới" trước đó),
 * trung bình điểm thành phần, thẻ hay gặp, từng đánh giá kèm phản hồi của mentor.
 */
export default function MentorReviews({ mentorId, onLoaded, renderActions }: { mentorId: Uuid; onLoaded?: (summary: MentorReviewSummary) => void; renderActions?: (review: Review) => ReactNode }) {
  const [data, setData] = useState<MentorReviewSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // US-44 (PRD-MATCH-9) — 5 đánh giá gần nhất, mở rộng khi cần
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<"newest" | "highest" | "lowest">("newest");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const load = useCallback(() => mentoringApi.reviewSummary(mentorId).then((d) => {
    setData(d);
    onLoaded?.(d);
  }).catch(() => setData(null)), [mentorId, onLoaded]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return null;
  const topTags = Object.entries(data.tags).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const subscores = REVIEW_SUBSCORES.filter(([k]) => data[k] !== null);
  // Phân bố sao tính trên các đánh giá đang hiển thị (đủ cho số lượng đánh giá một mentor)
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: data.reviews.filter((r) => r.rating === star).length }));
  const maxDist = Math.max(1, ...dist.map((d) => d.n));
  const visible = data.reviews
    .filter((r) => !tagFilter || r.tags?.includes(tagFilter))
    .sort((a, b) => sort === "highest" ? b.rating - a.rating || +new Date(b.createdAt) - +new Date(a.createdAt)
      : sort === "lowest" ? a.rating - b.rating || +new Date(b.createdAt) - +new Date(a.createdAt)
      : +new Date(b.createdAt) - +new Date(a.createdAt));
  return (
    <Card>
      <div id="reviews" />
      <CardHeader title={`Đánh giá (${data.reviewCount})`} description={`${data.sessionsCompleted} phiên đã hoàn thành`} />
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4">
        {data.newMentor ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Mentor mới</Badge>
            <span className="text-small text-ink-muted">Điểm hiển thị khi có từ 3 đánh giá.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[28px] leading-[34px] font-medium tabular">{data.rating?.toFixed(1)}</span>
              <Stars value={data.rating} />
            </div>
            <div className="histo" role="img" aria-label={`Phân bố đánh giá: ${dist.map((d) => `${d.star} sao ${d.n}`).join(", ")}`}>
              {dist.map((d) => (
                <div key={d.star} className="contents">
                  <span className="tabular">{d.star}★</span>
                  <div className="histo-bar"><span style={{ width: `${(d.n / maxDist) * 100}%` }} /></div>
                  <span className="tabular">{d.n}</span>
                </div>
              ))}
            </div>
            {subscores.map(([k, l]) => (
              <div key={k} className="flex flex-col">
                <span className="text-small text-ink-muted">{l}</span>
                <span className="font-mono tabular">{data[k]?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
        {topTags.length > 0 && (
          <Chips>{topTags.map(([t, n]) => (
            <Chip key={t} selected={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)} title="Lọc đánh giá theo thẻ này">
              {REVIEW_TAG_LABELS[t] || t} <span className="text-ink-subtle tabular">{n}</span>
            </Chip>
          ))}</Chips>
        )}
      </div>
      {data.reviews.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <span className="text-small text-ink-muted">Sắp xếp</span>
          {([["newest", "Mới nhất"], ["highest", "Điểm cao"], ["lowest", "Điểm thấp"]] as const).map(([k, l]) => (
            <Chip key={k} selected={sort === k} onClick={() => setSort(k)}>{l}</Chip>
          ))}
          {tagFilter && <Button size="sm" variant="ghost" onClick={() => setTagFilter(null)}>Bỏ lọc “{REVIEW_TAG_LABELS[tagFilter] || tagFilter}”</Button>}
        </div>
      )}
      {data.reviews.length === 0 && <EmptyState title="Chưa có đánh giá">Đánh giá xuất hiện sau khi mentee hoàn thành phiên học.</EmptyState>}
      <div className="flex flex-col divide-y divide-border">
        {(showAll ? visible : visible.slice(0, 5)).map((r) => (
          <article key={r.id} className="flex flex-col gap-1.5 px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars value={r.rating} />
              <strong>{r.menteeName}</strong>
              <span className="text-small text-ink-subtle">{formatDate(r.createdAt)}{r.updatedAt ? " · đã sửa" : ""}</span>
            </div>
            {(r.tags?.length ?? 0) > 0 && <div className="text-small text-ink-muted">{r.tags?.map((t) => REVIEW_TAG_LABELS[t] || t).join(" · ")}</div>}
            {r.comment && <p className="whitespace-pre-wrap">{r.comment}</p>}
            {r.mentorReply && (
              <div className="well mt-1 text-small">
                <span className="font-semibold">Mentor phản hồi:</span> {r.mentorReply}
              </div>
            )}
            {renderActions?.(r)}
            {r.canReply && <ReplyForm review={r} onDone={load} />}
            {r.canEdit && editing !== r.id && <div><Button size="sm" variant="ghost" onClick={() => setEditing(r.id)}>Sửa đánh giá</Button></div>}
            {editing === r.id && r.sessionId && <ReviewForm sessionId={r.sessionId} existing={r} onDone={() => { setEditing(null); load(); }} />}
          </article>
        ))}
      </div>
      {visible.length === 0 && data.reviews.length > 0 && <p className="px-5 py-4 text-small text-ink-muted">Không có đánh giá nào với thẻ này.</p>}
      {visible.length > 5 && (
        <div className="border-t border-border px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Thu gọn" : `Xem tất cả ${visible.length} đánh giá`}</Button>
        </div>
      )}
    </Card>
  );
}
