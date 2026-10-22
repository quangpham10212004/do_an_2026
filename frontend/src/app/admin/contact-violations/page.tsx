"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { PhoneOff } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Loading, PageHeader, Table, Tabs } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ContactKind, ContactViolationSummary } from "@/types";

const PERIODS: [string, string][] = [
  ["30", "30 ngày"],
  ["90", "90 ngày"],
  ["365", "12 tháng"],
];

const KIND_LABELS: Record<ContactKind, string> = {
  PHONE: "Số điện thoại",
  EMAIL: "Email",
  LINK: "Đường dẫn ngoài",
  SOCIAL: "Mạng xã hội",
};

/** Bản chốt v2.0 §12 — người gửi tin nhắn chứa thông tin liên hệ (đã bị che), nhiều lần nhất trước. */
function Violations() {
  const [days, setDays] = useState("30");
  const [items, setItems] = useState<ContactViolationSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(null);
    setError("");
    mentoringApi.adminContactViolations(Number(days)).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [days]);

  return (
    <>
      <PageHeader title="Chia sẻ liên hệ ngoài nền tảng"
        description="Tin nhắn luôn che số điện thoại, email, đường dẫn ngoài và mạng xã hội. Từ 3 lần trong 30 ngày, người gửi được đánh dấu và quản trị viên nhận thông báo." />
      <Alert className="mb-6">{error}</Alert>
      <Tabs className="mb-4" value={days} onChange={setDays} tabs={PERIODS.map(([v, l]) => ({ id: v, label: l }))} />
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={PhoneOff} title="Không có tin nhắn nào bị che liên hệ" /> : (
            <Table>
              <thead>
                <tr><th>Người gửi</th><th>Số tin bị che</th><th>Loại liên hệ</th><th>Gần nhất</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.userId}>
                    <td>{v.userName || <span className="font-mono text-small">{v.userId.slice(0, 8)}</span>}</td>
                    <td>{v.count}</td>
                    <td className="text-small">{v.kinds.map((k) => KIND_LABELS[k] ?? k).join(", ")}</td>
                    <td className="whitespace-nowrap">{formatDateTime(v.lastAt)}</td>
                    <td>{v.flagged && <Badge tone="warning">Đã báo admin</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

export default function AdminContactViolationsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Violations />}</RequireAuth>;
}
