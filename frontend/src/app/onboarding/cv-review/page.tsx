"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, ButtonLink, Loading, PageHeader } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import CvReview, { initialFields } from "@/features/ai/CvReview";
import { onbxApi, type CvInsight } from "@/features/onbx/api";
import { CompletenessChip, CvMissing, CvPrivacyNote, OnbSteps } from "@/features/onbx/components";
import { ApiError, errorMessage } from "@/lib/api";
import type { ConfirmedCvFields, Cv, SessionUser } from "@/types";

const STEPS = ["Tải CV", "Kiểm tra thông tin", "Trò chuyện làm rõ mục tiêu", "Gợi ý mentor"];

/** /onboarding/cv-review: kiểm tra những gì AI đọc được từ CV trước khi chatbot bắt đầu. */
function CvReviewScreen({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [cv, setCv] = useState<Cv | null | undefined>(undefined);
  const [insight, setInsight] = useState<CvInsight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    aiApi.latestEnrichment(user.userId)
      .then((r) => {
        if (!r || r.conversation) { router.replace("/cv-enrichment"); return; }
        setCv(r.cv);
        onbxApi.completeness(r.cv.id).then(setInsight).catch(() => undefined);
      })
      .catch(() => router.replace("/cv-enrichment"));
  }, [user, router]);

  async function confirm(fields: ConfirmedCvFields) {
    if (!cv) return;
    setBusy(true);
    setError("");
    try {
      await aiApi.confirmCvFields(cv.id, fields);
      await aiApi.startEnrichment(cv.id);
      router.push("/cv-enrichment");
    } catch (e) {
      setError(e instanceof ApiError && e.code === "PROFILE_REQUIRED" ? `${errorMessage(e)} Hãy tạo hồ sơ trước.` : errorMessage(e));
      setBusy(false);
    }
  }

  if (!cv) return <Loading />;
  return (
    <div className="mx-auto max-w-[820px]">
      <OnbSteps current={1} labels={STEPS} />
      <PageHeader
        title="Đây là những gì AI hiểu từ CV của bạn"
        description="Sửa lại nếu chưa đúng. Bạn có thể thêm hoặc xoá bất kỳ mục nào."
        actions={insight ? <CompletenessChip percent={insight.percent} /> : undefined}
      />
      <div className="flex flex-col gap-4">
        <Alert>{error}</Alert>
        <CvMissing insight={insight} />
        <CvReview key={cv.id} cv={cv} busy={busy} onConfirm={confirm} />
        <CvPrivacyNote />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ButtonLink href="/cv-enrichment?new=1">Thay CV khác</ButtonLink>
          <Link href="/onboarding/manual" className="inline-flex min-h-11 items-center text-small font-semibold">Điền thủ công thay vì dùng CV</Link>
        </div>
      </div>
    </div>
  );
}

export default function CvReviewPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <CvReviewScreen user={user} />}</RequireAuth>;
}
