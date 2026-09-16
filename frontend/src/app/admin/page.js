"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, PageHead, useDialog } from "@/components/ui";
import { authApi } from "@/features/auth/api";
import { mentoringApi } from "@/features/mentoring/api";
import { paymentApi } from "@/features/payment/api";
import { profileApi } from "@/features/profile/api";
import { formatMoney } from "@/lib/format";

function Stat({ label, value, href }) {
  const body = (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat">{value ?? "—"}</div>
    </div>
  );
  return href ? <Link href={href} style={{ color: "inherit", textDecoration: "none" }}>{body}</Link> : body;
}

function AdminHome() {
  const [users, setUsers] = useState(null);
  const [mentoring, setMentoring] = useState(null);
  const [payments, setPayments] = useState(null);
  const [msg, setMsg] = useState("");
  const [dialog, ask] = useDialog();

  useEffect(() => {
    authApi.adminStats().then(setUsers).catch(() => {});
    mentoringApi.adminStats().then(setMentoring).catch(() => {});
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
        <Stat label="Mentor" value={users?.mentors} href="/admin/users" />
        <Stat label="Mentee" value={users?.mentees} href="/admin/users" />
        <Stat label="AI Interview chờ duyệt" value={mentoring?.interviewsPendingReview} href="/admin/interviews" />
      </div>
      <h2>Mentoring</h2>
      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        <Stat label="Phiên chờ thanh toán" value={mentoring?.pendingSessions} />
        <Stat label="Phiên đã xác nhận" value={mentoring?.confirmedSessions} />
        <Stat label="Phiên hoàn thành" value={mentoring?.completedSessions} />
        <Stat label="Mentor đã duyệt / từ chối" value={mentoring ? `${mentoring.mentorsApproved} / ${mentoring.mentorsRejected}` : null} />
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
          <button className="btn secondary" onClick={() => profileApi.rebuildEmbeddings(false).then((r) => setMsg(`Đã xử lý: ${r.mentors} mentor, ${r.mentees} mentee, ${r.pending} đang chờ.`))}>Bổ sung embedding còn thiếu</button>
          <button className="btn secondary" onClick={async () => (await ask({ title: "Sinh lại toàn bộ embedding?", message: "Tất cả hồ sơ mentor và mentee sẽ được tính lại vector. Việc này có thể mất vài phút.", confirmText: "Sinh lại" })) && profileApi.rebuildEmbeddings(true).then((r) => setMsg(`Đã sinh lại: ${r.mentors} mentor, ${r.mentees} mentee, ${r.pending} đang chờ.`))}>Sinh lại toàn bộ</button>
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
