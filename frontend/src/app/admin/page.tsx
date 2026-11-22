"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { DatabaseZap, Flag, Landmark, MessageSquareWarning, RefreshCw, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, Loading, PageHeader, SectionTitle, Select, useDialog } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { formatAgreement } from "@/features/ai/InterviewViews";
import { authApi } from "@/features/auth/api";
import { matchingApi } from "@/features/matching/api";
import { mentoringApi } from "@/features/mentoring/api";
import { paymentApi } from "@/features/payment/api";
import { blogApi } from "@/features/learning/blogApi";
import { adminDashApi, PERIODS, PERIOD_LABELS, type ActivityItem, type DashExtras, type DashPeriod, type QueueExtras, type ServiceStatus } from "@/features/admindash/api";
import { ActivityList, DashKpiRow, GmvChart, ServiceList, TopMentors } from "@/features/admindash/DashViews";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { InterviewStats, MentoringStats, PaymentStats, UserStats } from "@/types";

/** Ghép các mảnh phụ "1 quá hạn · 2 có cờ"; bỏ phần bằng 0. */
function joinSub(parts: [number, string][], fallback: string): string {
  const s = parts.filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`).join(" · ");
  return s || fallback;
}

function Attn({ label, count, sub, href, icon: Icon, tone }: { label: string; count: number | null; sub: string; href: string; icon: LucideIcon; tone?: "warn" | "danger" }) {
  return (
    <Link href={href} className={tone ? `adm-attn-${tone}` : undefined}>
      <span className="adm-attn-top">{label}<Icon aria-hidden="true" className="size-4 text-accent-ink" /></span>
      <span className="adm-attn-num">{count ?? "—"}</span>
      <span className="adm-attn-sub">{sub}</span>
    </Link>
  );
}

function Kpi({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (<><div className="l">{label}</div><div className="v">{value ?? "—"}</div>{hint && <div className="h">{hint}</div>}</>);
  return href ? <Link href={href} className="adm-kpi block hover:no-underline">{body}</Link> : <div className="adm-kpi">{body}</div>;
}

function SessionBar({ m }: { m: MentoringStats }) {
  const parts: [string, number, string][] = [
    ["Hoàn thành", m.completedSessions, "var(--accent)"],
    ["Đã xác nhận", m.confirmedSessions, "color-mix(in srgb, var(--accent) 55%, var(--surface))"],
    ["Chờ thanh toán", m.pendingSessions, "#d9a441"],
    ["Đã huỷ", m.cancelledSessions, "#9aa59a"],
    ["Tranh chấp", m.disputedSessions, "#c0483b"],
  ];
  const total = parts.reduce((t, p) => t + p[1], 0);
  return (
    <>
      <div className="adm-bar" role="img" aria-label="Phân bố phiên theo trạng thái">
        {total > 0 && parts.map(([l, n, c]) => n > 0 && <span key={l} style={{ width: `${(n / total) * 100}%`, background: c }} />)}
      </div>
      <div className="adm-legend">{parts.map(([l, n, c]) => <span key={l}><i style={{ background: c }} />{l}: {n}</span>)}</div>
    </>
  );
}

function AdminHome() {
  const [users, setUsers] = useState<UserStats | null>(null);
  const [mentoring, setMentoring] = useState<MentoringStats | null>(null);
  const [interviews, setInterviews] = useState<InterviewStats | null>(null);
  const [payments, setPayments] = useState<PaymentStats | null>(null);
  const [disputes, setDisputes] = useState<{ n: number; overdue: number; expiring: number } | null>(null);
  const [payouts, setPayouts] = useState<{ n: number; sum: number } | null>(null);
  const [reports, setReports] = useState<{ n: number; contact: number } | null>(null);
  const [blogReports, setBlogReports] = useState<{ n: number; multi: number } | null>(null);
  const [period, setPeriod] = useState<DashPeriod>("30d");
  const [extras, setExtras] = useState<DashExtras | null>(null);
  const [vq, setVerificationQueue] = useState<QueueExtras | null>(null);
  const [reportError, setReportError] = useState("");
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [msg, setMsg] = useState("");
  const [dialog, ask] = useDialog();

  useEffect(() => {
    authApi.adminStats().then(setUsers).catch(() => {});
    mentoringApi.adminStats().then(setMentoring).catch(() => {});
    aiApi.adminStats().then(setInterviews).catch(() => {});
    paymentApi.adminStats().then(setPayments).catch(() => {});
    mentoringApi.adminDisputes("ACTIVE").then((d) => {
      const soon = Date.now() + 12 * 3600000;
      setDisputes({
        n: d.length,
        overdue: d.filter((x) => x.overdue).length,
        expiring: d.filter((x) => !x.overdue && !x.firstResponseAt && new Date(x.firstResponseDueAt).getTime() <= soon).length,
      });
    }).catch(() => {});
    paymentApi.adminPayouts("REQUESTED").then((p) => setPayouts({ n: p.length, sum: p.reduce((t, x) => t + (x.amount ?? 0), 0) })).catch(() => {});
    mentoringApi.adminMessageReports("OPEN").then((r) => setReports({ n: r.length, contact: r.filter((x) => x.reason === "OFF_PLATFORM_PAYMENT").length })).catch(() => {});
    blogApi.admin.reports("OPEN").then((r) => {
      const perPost = new Map<string, number>();
      r.forEach((x) => perPost.set(x.postId, (perPost.get(x.postId) ?? 0) + 1));
      setBlogReports({ n: r.length, multi: [...perPost.values()].filter((c) => c >= 2).length });
    }).catch(() => {});
    adminDashApi.recentActivity().then(setActivity).catch(() => setActivity([]));
    adminDashApi.services().then(setServices).catch(() => setServices([]));
    adminDashApi.verificationQueue().then(setVerificationQueue).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    setExtras(null);
    setReportError("");
    adminDashApi.summary(period).then((e) => live && setExtras(e)).catch((e) => live && setReportError(errorMessage(e)));
    return () => { live = false; };
  }, [period]);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Sức khoẻ nền tảng và việc cần xử lý hôm nay."
        actions={
          <label className="adm-period">
            Kỳ xem
            <Select value={period} onChange={(e) => setPeriod(e.target.value as DashPeriod)} aria-label="Kỳ xem">
              {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </Select>
          </label>
        }
      />
      {dialog}
      <div className="flex flex-col gap-8">
        {msg && <Alert tone="info">{msg}</Alert>}
        <section>
          <SectionTitle title="Việc cần xử lý" />
          <div className="adm-attn">
            <Attn tone="warn" label="Duyệt mentor" count={vq?.verificationPending ?? null} sub={vq ? joinSub([[vq.verificationOverdue, "quá hạn"], [vq.verificationFlagged, "AI chưa chắc"]], "Chờ duyệt") : "Chờ duyệt"} href="/admin/verification" icon={ShieldCheck} />
            <Attn tone="danger" label="Tranh chấp" count={disputes?.n ?? null} sub={disputes ? joinSub([[disputes.overdue, "quá hạn xử lý"], [disputes.expiring, "sắp hết hạn xử lý"]], "Đang mở hoặc đang xem xét") : "Đang tải"} href="/admin/disputes" icon={Scale} />
            <Attn label="Yêu cầu rút tiền" count={payouts?.n ?? null} sub={payouts ? `Tổng ${formatMoney(payouts.sum)}` : "Đang tải"} href="/admin/payouts" icon={Landmark} />
            <Attn label="Báo cáo tin nhắn" count={reports?.n ?? null} sub={reports ? joinSub([[reports.contact, "vi phạm liên hệ"]], "Chưa xử lý") : "Đang tải"} href="/admin/message-reports" icon={MessageSquareWarning} />
            <Attn label="Kiểm duyệt blog" count={blogReports?.n ?? null} sub={blogReports ? joinSub([[blogReports.multi, "bài nhiều báo cáo"]], "Báo cáo chưa xử lý") : "Đang tải"} href="/admin/blog" icon={Flag} />
          </div>
        </section>
        <section>
          <SectionTitle title="Chỉ số trong kỳ" />
          {reportError && <Alert tone="danger">{reportError}</Alert>}
          <DashKpiRow k={extras?.kpis ?? null} sessions={mentoring?.completedSessions ?? null} />
        </section>
        <div className="adm-dash-grid">
          <div className="adm-dash-main">
            <Card>
              <CardHeader title="GMV theo tuần" description="Tổng học phí thanh toán." />
              <CardBody>{extras ? <GmvChart points={extras.gmv} /> : !reportError && <Loading />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Mentor nổi bật" description="Xếp theo GMV trong kỳ." />
              {extras ? <TopMentors rows={extras.topMentors} /> : !reportError && <CardBody><Loading /></CardBody>}
            </Card>
          </div>
          <div className="adm-dash-side">
            <Card>
              <CardHeader title="Hoạt động gần đây" />
              <CardBody>{activity ? <ActivityList items={activity} /> : <Loading />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Trạng thái dịch vụ" />
              <CardBody>{services ? <ServiceList items={services} /> : <Loading />}</CardBody>
            </Card>
          </div>
        </div>
        <section>
          <SectionTitle title="Toàn thời gian" />
          <div className="adm-kpis">
            <Kpi label="Tổng tài khoản" value={users?.total} hint={users ? `${users.mentees} mentee, ${users.mentors} mentor` : undefined} href="/admin/users" />
            <Kpi label="Phiên hoàn thành" value={mentoring?.completedSessions} hint={mentoring ? `${mentoring.confirmedSessions} đã xác nhận` : undefined} />
            <Kpi label="Doanh thu (sandbox)" value={payments ? formatMoney(payments.totalRevenue) : null} hint={payments ? `Phí nền tảng ${formatMoney(payments.totalPlatformFee)}` : undefined} href="/admin/transactions" />
            <Kpi label="Giao dịch thành công" value={payments?.successCount} hint={payments ? `${payments.failedCount} thất bại, ${payments.refundedCount} hoàn tiền` : undefined} href="/admin/transactions" />
            <Kpi label="Mentor duyệt / từ chối" value={interviews ? `${interviews.mentorsApproved} / ${interviews.mentorsRejected}` : null} />
          </div>
        </section>
        <div className="adm-two">
          <Card>
            <CardHeader title="Phân bố phiên mentoring" description="Theo trạng thái hiện tại." />
            <CardBody>{mentoring ? <SessionBar m={mentoring} /> : <Loading />}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Đồng thuận admin - AI" description="Mục tiêu từ 80% trở lên." />
            <CardBody>
              <div className="text-[32px] font-bold text-accent-ink">{formatAgreement(interviews)}</div>
              <p className="mt-2 text-small text-ink-muted">Chỉ tính các buổi AI khuyến nghị duyệt hoặc từ chối.</p>
              <Link className="btn btn-sm mt-3" href="/admin/verification">Mở duyệt mentor</Link>
            </CardBody>
          </Card>
        </div>
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
