"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Gift, Share2, Star } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Avatar, ButtonLink, Loading, PageHeader, Stars } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import ReviewForm, { MenteeFeedbackForm } from "@/features/mentoring/ReviewForm";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MentoringSession, Review, SessionUser } from "@/types";

const EDIT_WINDOW_MS = 48 * 3600 * 1000;

function ReviewPage({ user }: { user: SessionUser }) {
  const { id } = useParams<{ id: string }>();
  const isMentor = user.role === "MENTOR";
  const [s, setS] = useState<MentoringSession | undefined>(undefined);
  const [mine, setMine] = useState<Review | undefined>(undefined);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await mentoringApi.session(id);
      setS(session);
      if (!isMentor && session.reviewed) {
        const all = await mentoringApi.mentorReviews(session.mentorId).catch(() => [] as Review[]);
        setMine(all.find((r) => r.sessionId === session.id));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, isMentor]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!s) return <Loading />;

  const other = isMentor ? s.menteeName : s.mentorName;
  const editable = !!mine && Date.now() - new Date(mine.createdAt).getTime() < EDIT_WINDOW_MS;
  const reviewable = s.status === "COMPLETED" && (isMentor || s.kind !== "TRIAL");

  return (
    <>
      <PageHeader back={{ href: `/mentoring/sessions/${s.id}`, label: "Chi tiết phiên" }} title="Đánh giá phiên học"
        description={isMentor ? "Điểm chuẩn bị và tham gia giúp mentee theo dõi tiến độ của mình." : "Đánh giá giúp mentee khác chọn đúng người và giúp mentor cải thiện."} />
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <section className="ses-sec" aria-label={isMentor ? "Mentor đánh giá mentee" : "Mentee đánh giá mentor"}>
          <div className="ses-sec-head"><h2>{isMentor ? "Mentor đánh giá mentee" : "Mentee đánh giá mentor"}</h2></div>
          <div className="ses-sec-body flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={other} />
              <div className="min-w-0">
                <b className="[overflow-wrap:anywhere]">{s.topic || "Phiên học"} với {other}</b>
                <div className="text-small text-ink-muted">{formatDate(s.scheduledAt)} · {s.durationMinutes} phút</div>
              </div>
            </div>

            {!reviewable ? (
              <Alert tone="info">{s.status !== "COMPLETED" ? "Chỉ đánh giá được sau khi phiên hoàn thành." : "Phiên trải nghiệm không có đánh giá công khai."}</Alert>
            ) : done ? (
              <div className="ses-bignote">
                <span className="ico" aria-hidden="true"><Star /></span>
                <h2 className="text-title-2 font-bold">Cảm ơn bạn đã đánh giá</h2>
                <p className="text-ink-muted">{done}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {!isMentor && <ButtonLink href={`/mentoring/book/${s.mentorId}`} variant="primary">Đặt phiên tiếp theo</ButtonLink>}
                  <ButtonLink href="/mentoring/sessions">Về danh sách phiên</ButtonLink>
                </div>
                {!isMentor && (
                  <div className="ses-share-card">
                    <Gift aria-hidden="true" className="size-6 flex-none" />
                    <div><b>Giới thiệu bạn bè</b><div className="text-small">Chia sẻ mã giới thiệu để bạn bè được giảm học phí buổi đầu và bạn nhận mã giảm giá.</div></div>
                    <ButtonLink href={`/referral/share?mentor=${s.mentorId}`} icon={Share2}>Chia sẻ mã</ButtonLink>
                  </div>
                )}
              </div>
            ) : isMentor ? (
              <MenteeFeedbackForm sessionId={s.id}
                onDone={() => setDone("Điểm và nhận xét được lưu vào mục Tiến độ của mentee.")} />
            ) : s.reviewed && !editable ? (
              <Alert tone="success" title="Bạn đã đánh giá phiên này">
                <Stars value={s.reviewRating} />
                {mine?.comment && <p className="mt-1">{mine.comment}</p>}
                <p className="mt-1 text-small">Đánh giá chỉ sửa được trong 48 giờ sau khi đăng. <Link href="/mentoring/sessions" className="font-semibold">Về danh sách phiên</Link></p>
              </Alert>
            ) : (
              <ReviewForm sessionId={s.id} existing={mine} skipHref={`/mentoring/sessions/${s.id}`}
                onDone={() => setDone("Đánh giá hiện công khai trên hồ sơ mentor; bạn có thể sửa trong 48 giờ.")} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export default function SessionReviewPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <ReviewPage user={user} />}</RequireAuth>;
}
