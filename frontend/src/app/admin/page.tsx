"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, PageHead, useDialog } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { authApi } from "@/features/auth/api";
import { matchingApi } from "@/features/matching/api";
import { mentoringApi } from "@/features/mentoring/api";
import { paymentApi } from "@/features/payment/api";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { InterviewStats, MentoringStats, PaymentStats, UserStats } from "@/types";

function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat">{value ?? "—"}</div>
    </div>
  );
  return href ? <Link href={href} style={{ color: "inherit", textDecoration: "none" }}>{body}</Link> : body;
}

function AdminHome() {
  const [users, setUsers] = useState<UserStats | null>(null);
  const [mentoring, setMentoring] = useState<MentoringStats | null>(null);
  const [interviews, setInterviews] = useState<InterviewStats | null>(null);
  const [payments, setPayments] = useState<PaymentStats | null>(null);
  const [msg, setMsg] = useState("");
  const [dialog, ask] = useDialog();

  useEffect(() => {
    authApi.adminStats().then(setUsers).catch(() => {});
    mentoringApi.adminStats().then(setMentoring).catch(() => {});
    aiApi.adminStats().then(setInterviews).catch(() => {});
    paymentApi.adminStats().then(setPayments).catch(() => {});
  }, []);

  return (
    <>
      <PageHead title="Bảng điều khiển quản trị" subtitle="Tổng quan người dùng, mentor, phiên mentoring và giao dịch." />
      {dialog}
      {msg && <Alert type="info">{msg}</Alert>}
      <h2>Người dùng</h2>
      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        <Stat label="Tổng tài khoản" value={users?.total} href="/admin/users" />
        <Stat label="Mentor" value={users?.mentors} href="/mentors?all=1" />
        <Stat label="Mentee" value={users?.mentees} href="/admin/users" />
        <Stat label="AI Interview chờ duyệt" value={interviews?.interviewsPendingReview} href="/admin/interviews" />
      </div>
      <h2>Mentoring</h2>
      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        <Stat label="Phiên chờ thanh toán" value={mentoring?.pendingSessions} />
        <Stat label="Phiên đã xác nhận" value={mentoring?.confirmedSessions} />
        <Stat label="Phiên hoàn thành" value={mentoring?.completedSessions} />
        <Stat label="Mentor đã duyệt / từ chối" value={interviews ? `${interviews.mentorsApproved} / ${interviews.mentorsRejected}` : null} />
      </div>
      <h2>Thanh toán</h2>
      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        <Stat label="Doanh thu (sandbox)" value={payments ? formatMoney(payments.totalRevenue) : null} href="/admin/transactions" />
        <Stat label="Giao dịch thành công" value={payments?.successCount} href="/admin/transactions" />
        <Stat label="Giao dịch thất bại" value={payments?.failedCount} href="/admin/transactions" />
        <Stat label="Đã hoàn tiền" value={payments?.refundedCount} href="/admin/transactions" />
      </div>
      <div className="card">
        <h2>Bảo trì AI Matching</h2>
        <p className="muted small">Sinh embedding cho các hồ sơ chưa có vector (hoặc sinh lại toàn bộ khi đổi model/định dạng văn bản chuẩn hoá).</p>
        <div className="row">
          <button className="btn secondary" onClick={() => matchingApi.rebuildEmbeddings(false).then((r) => setMsg(`Đã xử lý: ${r.mentors} mentor, ${r.mentees} mentee, ${r.pending} đang chờ.`)).catch((e) => setMsg(errorMessage(e)))}>Bổ sung embedding còn thiếu</button>
          <button className="btn secondary" onClick={async () => (await ask({ title: "Sinh lại toàn bộ embedding?", message: "Tất cả hồ sơ mentor và mentee sẽ được tính lại vector. Việc này có thể mất vài phút.", confirmText: "Sinh lại" })) && matchingApi.rebuildEmbeddings(true).then((r) => setMsg(`Đã sinh lại: ${r.mentors} mentor, ${r.mentees} mentee, ${r.pending} đang chờ.`)).catch((e) => setMsg(errorMessage(e)))}>Sinh lại toàn bộ</button>
        </div>
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminHome />
    </RequireAuth>
  );
}
