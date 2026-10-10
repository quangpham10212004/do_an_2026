"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ArrowUpRight, DatabaseZap, RefreshCw } from "lucide-react";
import { Alert, Button, Card, CardFooter, CardHeader, PageHeader, SectionTitle, useDialog } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { formatAgreement } from "@/features/ai/InterviewViews";
import { authApi } from "@/features/auth/api";
import { matchingApi } from "@/features/matching/api";
import { mentoringApi } from "@/features/mentoring/api";
import { paymentApi } from "@/features/payment/api";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { InterviewStats, MentoringStats, PaymentStats, UserStats } from "@/types";

function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="stat-label flex items-start justify-between gap-2">{label}{href && <ArrowUpRight aria-hidden="true" className="size-4 flex-none text-ink-subtle" />}</div>
      <div className="stat-value">{value ?? "—"}</div>
    </>
  );
  return href
    ? <Link href={href} className="stat text-ink hover:bg-surface-hover hover:text-ink hover:no-underline">{body}</Link>
    : <div className="stat">{body}</div>;
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
      <PageHeader title="Tổng quan quản trị" description="Người dùng, mentor, phiên mentoring và giao dịch trên toàn hệ thống." />
      {dialog}
      <div className="flex flex-col gap-8">
        {msg && <Alert tone="info">{msg}</Alert>}
        <section>
          <SectionTitle title="Người dùng" />
          <div className="card stats">
            <Stat label="Tổng tài khoản" value={users?.total} href="/admin/users" />
            <Stat label="Mentor" value={users?.mentors} href="/mentors?all=1" />
            <Stat label="Mentee" value={users?.mentees} href="/admin/users" />
            <Stat label="AI Interview chờ duyệt" value={interviews?.interviewsPendingReview} href="/admin/interviews" />
          </div>
        </section>
        <section>
          <SectionTitle title="Mentoring" />
          <div className="card stats">
            <Stat label="Phiên chờ thanh toán" value={mentoring?.pendingSessions} />
            <Stat label="Phiên đã xác nhận" value={mentoring?.confirmedSessions} />
            <Stat label="Phiên hoàn thành" value={mentoring?.completedSessions} />
            <Stat label="Mentor duyệt / từ chối" value={interviews ? `${interviews.mentorsApproved} / ${interviews.mentorsRejected}` : null} />
            <Stat label="Đồng thuận admin – AI (mục tiêu ≥ 80%)" value={formatAgreement(interviews)} href="/admin/interviews" />
          </div>
        </section>
        <section>
          <SectionTitle title="Thanh toán" />
          <div className="card stats">
            <Stat label="Doanh thu (sandbox)" value={payments ? formatMoney(payments.totalRevenue) : null} href="/admin/transactions" />
            <Stat label="Giao dịch thành công" value={payments?.successCount} href="/admin/transactions" />
            <Stat label="Giao dịch thất bại" value={payments?.failedCount} href="/admin/transactions" />
            <Stat label="Đã hoàn tiền" value={payments?.refundedCount} href="/admin/transactions" />
          </div>
        </section>
        <Card>
          <CardHeader title="Bảo trì AI Matching" description="Sinh embedding cho hồ sơ chưa có vector, hoặc sinh lại toàn bộ khi đổi model hay định dạng văn bản chuẩn hoá." />
          <CardFooter>
            <Button icon={RefreshCw} onClick={async () => (await ask({ title: "Sinh lại toàn bộ embedding?", message: "Tất cả hồ sơ mentor và mentee sẽ được tính lại vector. Việc này có thể mất vài phút.", confirmText: "Sinh lại" })) && matchingApi.rebuildEmbeddings(true).then((r) => setMsg(`Đã sinh lại: ${r.mentors} mentor, ${r.mentees} mentee, ${r.pending} đang chờ.`)).catch((e) => setMsg(errorMessage(e)))}>Sinh lại toàn bộ</Button>
            <Button variant="primary" icon={DatabaseZap} onClick={() => matchingApi.rebuildEmbeddings(false).then((r) => setMsg(`Đã xử lý: ${r.mentors} mentor, ${r.mentees} mentee, ${r.pending} đang chờ.`)).catch((e) => setMsg(errorMessage(e)))}>Bổ sung embedding còn thiếu</Button>
          </CardFooter>
        </Card>
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
