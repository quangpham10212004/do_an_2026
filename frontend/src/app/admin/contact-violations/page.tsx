"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { PhoneOff } from "lucide-react";
import { Alert, Card, EmptyState, Loading, PageHeader, Table, Tabs } from "@/components/ui";
import { listContactViolations, listMessageReports, type ViolationRow } from "@/features/modx/api";
import ModSubnav from "@/features/modx/ModSubnav";
import { formatDateTime } from "@/lib/format";

const PERIODS: [string, string][] = [
  ["30", "30 ngày"],
  ["90", "90 ngày"],
  ["365", "12 tháng"],
];

const ROLE: Record<string, string> = { MENTEE: "Mentee", MENTOR: "Mentor" };

/** Bản chốt v2.0 §12 — người gửi tin nhắn chứa thông tin liên hệ (nội dung đã che), nhiều lần nhất trước. */
function Violations() {
  const [days, setDays] = useState("30");
  const [items, setItems] = useState<ViolationRow[] | null>(null);
  const [error, setError] = useState("");
  const [openReports, setOpenReports] = useState<number | undefined>();

  useEffect(() => {
    setItems(null);
    setError("");
    listContactViolations(Number(days)).then((r) => { setItems(r.items); setError(r.error ?? ""); });
  }, [days]);
  useEffect(() => {
    listMessageReports().then((r) => setOpenReports(r.items.filter((x) => x.status === "OPEN").length));
  }, []);

  return (
    <>
      <PageHeader title="Kiểm duyệt tin nhắn"
        description="Báo cáo từ người dùng và tin nhắn bị hệ thống ghi nhận chứa thông tin liên hệ." />
      <ModSubnav active="violations" reports={openReports} violations={items?.length} />
      <Alert className="mb-4">{error}</Alert>
      <Tabs className="mb-4" value={days} onChange={setDays} tabs={PERIODS.map(([v, l]) => ({ id: v, label: l }))} />
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={PhoneOff} title="Không có tin nhắn nào bị che liên hệ" /> : (
            <Table>
              <thead>
                <tr><th>Người dùng</th><th>Nội dung phát hiện</th><th>Lần</th><th>Thời gian</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.userId}>
                    <td>
                      <b>{v.userName || <span className="font-mono text-small">{v.userId.slice(0, 8)}</span>}</b>
                      {v.role && <div className="text-small text-ink-muted">{ROLE[v.role]}</div>}
                    </td>
                    <td className="min-w-[240px]"><span className="adm-mask">{v.detected}</span></td>
                    <td><span className={`adm-pill ${v.count >= 3 ? "danger" : v.count === 2 ? "warning" : ""}`}>{v.count}</span></td>
                    <td className="whitespace-nowrap text-small">{formatDateTime(v.lastAt)}</td>
                    <td>{v.flagged ? <span className="adm-pill warning">Đã báo quản trị viên</span> : <span className="text-ink-subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="p-4 text-small leading-relaxed text-ink-muted">Lần 1: cảnh báo trong khung chat. Lần 2: thông báo chính thức. Từ lần 3 trong 30 ngày: người gửi được đánh dấu và quản trị viên nhận thông báo để xem xét đình chỉ.</p>
        </Card>
      )}
    </>
  );
}

export default function AdminContactViolationsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Violations />}</RequireAuth>;
}
