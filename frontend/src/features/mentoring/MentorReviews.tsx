"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Stars } from "@/components/ui";
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
    <div className="stack" style={{ marginTop: 6 }}>
      <Alert>{error}</Alert>
      <textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Phản hồi công khai (một lần, tối đa 500 ký tự)" />
      <button className="btn secondary sm" disabled={!text.trim()} onClick={async () => {
        try {
          await mentoringApi.replyReview(review.id, text.trim());
          onDone();
        } catch (e) {
          setError(errorMessage(e));
        }
      }}>Gửi phản hồi</button>
    </div>
  );
}

/**
 * US-41 (PRD-REV-3/5) — khối đánh giá trên trang mentor: điểm Bayes chỉ khi ≥ 3 đánh giá ("Mentor mới" trước đó),
 * trung bình điểm thành phần, thẻ hay gặp, từng đánh giá kèm phản hồi của mentor.
 */
export default function MentorReviews({ mentorId }: { mentorId: Uuid }) {
  const [data, setData] = useState<MentorReviewSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // US-44 (PRD-MATCH-9) — 5 đánh giá gần nhất, mở rộng khi cần
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(() => mentoringApi.reviewSummary(mentorId).then(setData).catch(() => setData(null)), [mentorId]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return null;
  const topTags = Object.entries(data.tags).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <div className="card" id="reviews">
      <h2>Đánh giá ({data.reviewCount})</h2>
      <p className="small muted">{data.sessionsCompleted} phiên đã hoàn thành</p>
      {data.newMentor
        ? <p><span className="badge new">Mentor mới</span> <span className="small muted">Điểm hiển thị khi có từ 3 đánh giá.</span></p>
        : <p><Stars value={data.rating} /> {data.rating?.toFixed(1)}/5</p>}
      {!data.newMentor && (
        <p className="small muted">
          {REVIEW_SUBSCORES.map(([k, l]) => data[k] !== null && `${l} ${data[k]?.toFixed(1)}`).filter(Boolean).join(" · ")}
        </p>
      )}
      {topTags.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {topTags.map(([t, n]) => <span key={t} className="chip">{REVIEW_TAG_LABELS[t] || t} ({n})</span>)}
        </div>
      )}
      {data.reviews.length === 0 && <p className="muted">Chưa có đánh giá.</p>}
      {(showAll ? data.reviews : data.reviews.slice(0, 5)).map((r) => (
        <div key={r.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div className="row"><Stars value={r.rating} /><strong className="small">{r.menteeName}</strong>
            <span className="muted small">{formatDate(r.createdAt)}{r.updatedAt ? " · đã sửa" : ""}</span></div>
          {(r.tags?.length ?? 0) > 0 && <div className="small muted">{r.tags?.map((t) => REVIEW_TAG_LABELS[t] || t).join(" · ")}</div>}
          {r.comment && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{r.comment}</div>}
          {r.mentorReply && (
            <div className="small" style={{ borderLeft: "3px solid var(--color-faded-gray)", paddingLeft: 8, marginTop: 4 }}>
              <strong>Mentor phản hồi:</strong> {r.mentorReply}
            </div>
          )}
          {r.canReply && <ReplyForm review={r} onDone={load} />}
          {r.canEdit && editing !== r.id && <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(r.id)}>Sửa đánh giá</button>}
          {editing === r.id && <ReviewForm sessionId={r.sessionId} existing={r} onDone={() => { setEditing(null); load(); }} />}
        </div>
      ))}
      {data.reviews.length > 5 && (
        <button className="btn ghost sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Thu gọn" : `Xem tất cả ${data.reviews.length} đánh giá`}</button>
      )}
    </div>
  );
}
