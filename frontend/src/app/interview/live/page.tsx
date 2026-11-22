"use client";

import RequireAuth from "@/components/RequireAuth";
import LiveRoom from "@/features/verification/LiveRoom";

/** Phòng phỏng vấn AI trực tiếp: /interview/live?id=<id buổi phỏng vấn>. */
export default function LiveInterviewPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      <LiveRoom />
    </RequireAuth>
  );
}
