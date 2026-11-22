"use client";

import { useEffect, useState } from "react";
import { Flag, ThumbsUp } from "lucide-react";
import { Button, Chip, Chips } from "@/components/ui";
import { REVIEW_REPORT_REASONS, profilexApi } from "./api";
import type { Review } from "@/types";

/** Hàng hành động dưới mỗi đánh giá: Hữu ích / Báo cáo (mock theo profilexApi). */
export default function ReviewActions({ review }: { review: Review }) {
  const [marked, setMarked] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let active = true;
    profilexApi.helpful(review.id).then((reaction) => {
      if (!active) return;
      setMarked(reaction.marked);
      setCount(reaction.helpfulCount);
    }).catch(() => {});
    return () => { active = false; };
  }, [review.id]);

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await profilexApi.toggleHelpful(review.id, !marked);
      setMarked(r.marked);
      setCount(r.helpfulCount);
    } catch { /* giữ nguyên trạng thái cũ */ } finally { setBusy(false); }
  };
  const report = async (reason: string) => {
    setBusy(true);
    try {
      await profilexApi.reportReview(review.id, reason);
      setReported(true);
      setReporting(false);
    } catch { /* cho phép thử lại */ } finally { setBusy(false); }
  };

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={marked ? "secondary" : "ghost"} icon={ThumbsUp} loading={busy && !reporting} onClick={toggle}
          aria-pressed={marked} aria-label={`Đánh dấu đánh giá của ${review.menteeName} là hữu ích`}>
          Hữu ích{count ? ` · ${count}` : ""}
        </Button>
        {reported
          ? <span className="text-small text-ink-subtle">Đã gửi báo cáo, cảm ơn bạn.</span>
          : <Button size="sm" variant="ghost" icon={Flag} onClick={() => setReporting(!reporting)} aria-expanded={reporting}
              aria-label={`Báo cáo đánh giá của ${review.menteeName}`}>Báo cáo</Button>}
      </div>
      {reporting && !reported && (
        <div role="group" aria-label="Lý do báo cáo">
          <Chips>{REVIEW_REPORT_REASONS.map((r) => <Chip key={r} onClick={() => report(r)}>{r}</Chip>)}</Chips>
        </div>
      )}
    </div>
  );
}
