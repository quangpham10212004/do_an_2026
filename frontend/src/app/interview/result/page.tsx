"use client";

import RequireAuth from "@/components/RequireAuth";
import ResultView from "@/features/verification/ResultView";

/** Kết quả phỏng vấn AI và lịch sử: /interview/result?id=<id kết quả> (không có id thì mở kết quả gần nhất). */
export default function InterviewResultPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      <ResultView />
    </RequireAuth>
  );
}
