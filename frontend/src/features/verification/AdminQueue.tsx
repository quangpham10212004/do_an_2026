"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { Alert, Avatar, Badge, Card, EmptyState, Input, Loading, PageHeader, Table, Tabs } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { domainLabel } from "@/features/profile/api";
import type { VerifyConfidence, VerifyQueue, VerifyQueueFilter, VerifyQueueItem, VerifyRecommendation } from "@/types/verification";
import { verifyAdminApi } from "./api";
import { fmtScore, waitingLabel } from "./utils";

const TABS: { id: VerifyQueueFilter; label: string }[] = [
  { id: "UNCLEAR", label: "Chờ xem xét" },
  { id: "DECIDED", label: "Đã quyết định" },
];

export const REC_LABEL: Record<VerifyRecommendation, string> = { APPROVE: "Nên duyệt", REVIEW: "Cần xem kỹ", REJECT: "Nên từ chối" };
export const CONF_LABEL: Record<VerifyConfidence, string> = { LOW: "tin cậy thấp", MEDIUM: "tin cậy trung bình", HIGH: "tin cậy cao" };
export const REC_TONE: Record<VerifyRecommendation, "success" | "warning" | "danger"> = { APPROVE: "success", REVIEW: "warning", REJECT: "danger" };

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="vf-kpi"><div className="l">{label}</div><div className="v">{value}</div>{hint && <div className="h">{hint}</div>}</div>;
}

function StatusCell({ i }: { i: VerifyQueueItem }) {
  if (i.status === "UNCLEAR") return i.overdue ? <Badge tone="danger">Quá hạn</Badge> : <>{waitingLabel(i.waitingSince, false)}</>;
  return <Badge tone={i.status === "APPROVED" ? "success" : "danger"}>{i.status === "APPROVED" ? "Đã duyệt" : "Đã từ chối"}</Badge>;
}

export default function AdminQueue() {
  const [filter, setFilter] = useState<VerifyQueueFilter>("UNCLEAR");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [data, setData] = useState<VerifyQueue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { const id = window.setTimeout(() => setTerm(q), 300); return () => window.clearTimeout(id); }, [q]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const result = await verifyAdminApi.queue(filter, term);
        if (alive) { setData(result); setError(""); }
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [filter, term]);

  return (
    <>
      <PageHeader title="Duyệt mentor" description="AI tự chấm các buổi phỏng vấn: đạt thì tự cấp xác thực, không đạt thì báo mentor. Chỉ những ca AI chưa chắc chắn mới chuyển về đây để bạn quyết định." />
      {data && (
        <div className="vf-kpis">
          <Kpi label="Chờ xem xét" value={data.stats.unclear} />
          <Kpi label="Quá hạn" value={data.stats.overdue} hint="Chờ quá 3 ngày làm việc" />
          <Kpi label="Đã duyệt tháng này" value={data.stats.approvedThisMonth} />
          <Kpi label="Đã từ chối tháng này" value={data.stats.rejectedThisMonth} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input aria-label="Tìm mentor" placeholder="Tìm tên hoặc email" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
      </div>
      <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={TABS.map((t) => ({ id: t.id, label: data ? `${t.label} (${data.counts[t.id]})` : t.label }))} />
      <Alert>{error}</Alert>
      {!data ? !error && <Loading /> : (
        <Card>
          {data.items.length === 0 ? <EmptyState icon={ShieldCheck} title={filter === "UNCLEAR" ? "Không có ca nào chờ xem xét" : "Chưa có quyết định nào"}>{filter === "UNCLEAR" ? "Các buổi phỏng vấn AI kết luận được sẽ không xuất hiện ở đây." : "Các ca đã duyệt hoặc từ chối sẽ hiện ở đây."}</EmptyState> : (
            <Table>
              <thead><tr><th>Ứng viên</th><th>Lĩnh vực</th><th>Điểm AI</th><th>AI đề xuất</th><th>{filter === "UNCLEAR" ? "Chờ" : "Quyết định"}</th><th></th></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="vf-cand"><Avatar name={i.name} size="sm" /><div><b>{i.name}</b><div className="text-small text-ink-muted">{i.years} năm · {i.email}</div></div></div>
                    </td>
                    <td>{domainLabel(i.domain)}</td>
                    <td><b>{fmtScore(i.totalScore)}</b> / 5</td>
                    <td><Badge tone={REC_TONE[i.recommendation]}>{REC_LABEL[i.recommendation]}</Badge><div className="text-small text-ink-subtle mt-0.5">{CONF_LABEL[i.confidence]}</div></td>
                    <td className="whitespace-nowrap"><StatusCell i={i} /></td>
                    <td className="actions">
                      <Link className="btn btn-sm" href={`/admin/verification/${i.id}`} aria-label={`${i.status === "UNCLEAR" ? "Xem xét" : "Xem"} hồ sơ ${i.name}`}>{i.status === "UNCLEAR" ? "Xem xét" : "Xem"}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      <p className="mt-3 text-small text-ink-subtle">Ca chờ quá 3 ngày làm việc được đánh dấu &quot;quá hạn&quot;. Ca có độ tin cậy thấp nên được xem kỹ video và văn bản từng câu trả lời.</p>
    </>
  );
}
