"use client";

import RequireAuth from "@/components/RequireAuth";
import VerifyStatusView from "@/features/verification/VerifyStatusView";

/** Xác thực năng lực mentor: trạng thái, quy định, kiểm tra thiết bị và bắt đầu phỏng vấn (menu mentor trỏ tới /interview). */
export default function InterviewPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      <VerifyStatusView />
    </RequireAuth>
  );
}
