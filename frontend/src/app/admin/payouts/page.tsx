"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { AlertTriangle, Banknote, CheckCircle2, Download } from "lucide-react";
import { Badge, Button, Card, EmptyState, FlashAlerts, Loading, Modal, PageHeader, Table, Tabs, Textarea, useDialog, type BadgeTone } from "@/components/ui";
import { adminxApi, normalizeName, type PayoutKpis } from "@/features/adminx/api";
import { downloadCsv } from "@/features/adminx/csv";
import { paymentApi } from "@/features/payment/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { Payout, PayoutStatus } from "@/types";

const FILTERS: [PayoutStatus | "", string][] = [["REQUESTED", "Chờ chuyển"], ["PAID", "Đã chuyển"], ["REJECTED", "Từ chối"], ["", "Tất cả"]];
const PAYOUT_TONE: Record<string, [string, BadgeTone]> = { REQUESTED: ["Chờ chuyển", "warning"], PAID: ["Đã chuyển", "success"], REJECTED: ["Từ chối", "danger"] };

const nameMatches = (p: Payout) => normalizeName(p.holderName) === normalizeName(p.mentorName);
const groupAccount = (n: string | null) => (n || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

/** US-42 (PRD-PAY-5) — admin chuyển khoản (sandbox) rồi đánh dấu PAID kèm mã tham chiếu, hoặc từ chối. */
function Payouts() {
  const [filter, setFilter] = useState<PayoutStatus | "">("REQUESTED");
  const [items, setItems] = useState<Payout[] | null>(null);
  const [kpis, setKpis] = useState<PayoutKpis | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [reviewing, setReviewing] = useState<Payout | null>(null);
  const [dialog, ask] = useDialog();
  const load = useCallback(() => {
    setItems(null);
    paymentApi.adminPayouts(filter).then(setItems).catch((e) => { setItems([]); setMsg({ error: errorMessage(e) }); });
    adminxApi.payoutKpis().then(setKpis).catch(() => setKpis(null));
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  };

  async function markPaid(p: Payout) {
    const ref = await ask({
      title: `Xác nhận đã chuyển ${formatVnd(p.amount)}`,
      message: `${p.bankName} · ${p.accountNumber ?? p.accountNumberMasked} · ${p.holderName}. Số dư của mentor được trừ sau khi xác nhận.`,
      input: { label: "Mã giao dịch ngân hàng *", maxLength: 100 },
      confirmText: "Xác nhận đã chuyển",
    });
    if (typeof ref === "string" && ref.trim()) act(() => paymentApi.markPayoutPaid(p.id, ref.trim()), "Đã đánh dấu đã chuyển.");
  }

  function exportBank() {
    const pending = (items ?? []).filter((p) => p.status === "REQUESTED");
    downloadCsv(`chuyen-khoan-${new Date().toISOString().slice(0, 10)}.csv`,
      ["STT", "Ngân hàng", "Số tài khoản", "Tên chủ tài khoản", "Số tiền (đ)", "Nội dung chuyển khoản"],
      pending.map((p, i) => [i + 1, p.bankName, p.accountNumber ?? "", p.holderName, p.amount, `MentorHub thanh toan ${p.mentorName ?? ""}`.trim()]));
  }

  const pendingCount = items?.filter((p) => p.status === "REQUESTED").length ?? 0;
  return (
    <>
      {dialog}
      <PageHeader title="Yêu cầu rút tiền" description="Chuyển khoản cho mentor rồi đánh dấu đã chuyển. Mỗi yêu cầu rút toàn bộ số dư khả dụng (tối thiểu 200.000 đ)."
        actions={<Button variant="secondary" icon={Download} onClick={exportBank} disabled={!pendingCount}>Xuất CSV cho ngân hàng</Button>} />
      <FlashAlerts flash={msg} className="mb-6" />
      {kpis && (
        <div className="adm-kpis mb-4">
          <div className="adm-kpi"><div className="l">Đang chờ</div><div className="v">{kpis.pending.count} yêu cầu</div><div className="h">{formatVnd(kpis.pending.amount)}</div></div>
          <div className="adm-kpi"><div className="l">Đã chuyển tháng này</div><div className="v">{kpis.paidThisMonth.count}</div><div className="h">{formatVnd(kpis.paidThisMonth.amount)}</div></div>
          <div className="adm-kpi"><div className="l">Thời gian xử lý TB</div><div className="v">{kpis.avgProcessingDays == null ? "—" : `${kpis.avgProcessingDays.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ngày`}</div></div>
        </div>
      )}
      <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={FILTERS.map(([v, l]) => ({ id: v, label: v === "REQUESTED" && kpis ? `${l} (${kpis.pending.count})` : l }))} />
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={Banknote} title="Không có yêu cầu nào" /> : (
            <Table>
              <thead><tr><th>Mentor</th><th className="num">Số tiền</th><th>Ngân hàng</th><th>Gửi lúc</th><th>Kiểm tra</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {items.map((p) => {
                  const [label, tone] = PAYOUT_TONE[p.status] ?? [p.status, "neutral"];
                  const ok = nameMatches(p);
                  return (
                    <tr key={p.id}>
                      <td><b>{p.mentorName}</b><div className="text-small text-ink-muted">Tên TK: {p.holderName}</div></td>
                      <td className="num font-semibold">{formatVnd(p.amount)}</td>
                      <td className="text-small">
                        <div>{p.bankName}</div>
                        <div className="text-ink-muted font-mono">{groupAccount(p.accountNumber ?? p.accountNumberMasked)}</div>
                      </td>
                      <td className="whitespace-nowrap">{formatDateTime(p.requestedAt)}</td>
                      <td>
                        {ok
                          ? <span className="adm-check ok"><CheckCircle2 aria-hidden="true" className="size-4" /> Khớp tên</span>
                          : <span className="adm-check warn"><AlertTriangle aria-hidden="true" className="size-4" /> Tên TK khác tên mentor</span>}
                      </td>
                      <td className="text-small">
                        <Badge tone={tone}>{label}</Badge>
                        {(p.reference || p.note) && <div className="mt-1 text-ink-muted">{p.reference && <span className="font-mono">{p.reference}</span>}{p.reference && p.note ? " · " : ""}{p.note}</div>}
                      </td>
                      <td className="actions">
                        {p.status === "REQUESTED" && (
                          <div className="flex justify-end gap-1">
                            {ok ? (
                              <>
                                <Button size="sm" variant="ghost" onClick={async () => {
                                  const reason = await ask({ title: "Từ chối yêu cầu rút tiền?", input: { label: "Lý do (gửi cho mentor)", maxLength: 500 }, confirmText: "Từ chối", danger: true });
                                  if (typeof reason === "string" && reason.trim()) act(() => paymentApi.rejectPayout(p.id, reason.trim()), "Đã từ chối yêu cầu.");
                                }}>Từ chối</Button>
                                <Button size="sm" variant="primary" onClick={() => markPaid(p)}>Đánh dấu đã chuyển</Button>
                              </>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => setReviewing(p)}>Xem xét</Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      {reviewing && (
        <ReviewDialog payout={reviewing} onClose={() => setReviewing(null)}
          onTransfer={() => { const p = reviewing; setReviewing(null); markPaid(p); }}
          onReject={(reason) => { const p = reviewing; setReviewing(null); act(() => paymentApi.rejectPayout(p.id, reason), "Đã từ chối yêu cầu."); }} />
      )}
    </>
  );
}

/** Hộp "Xem xét": tên chủ tài khoản khác tên hồ sơ — từ chối kèm lý do hoặc vẫn chuyển. */
function ReviewDialog({ payout, onClose, onTransfer, onReject }: { payout: Payout; onClose: () => void; onTransfer: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("Vui lòng xác nhận tên chủ tài khoản trùng với tên hồ sơ.");
  return (
    <Modal title={`${payout.mentorName} · ${formatVnd(payout.amount)}`} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onTransfer}>Vẫn chuyển</Button>
      <Button variant="danger" disabled={!reason.trim()} onClick={() => onReject(reason.trim())}>Từ chối yêu cầu</Button>
    </>}>
      <div className="adm-callout">Tên tài khoản &quot;{payout.holderName}&quot; khác tên hồ sơ &quot;{payout.mentorName}&quot;. Cần mentor xác nhận trước khi chuyển.</div>
      <label className="mt-4 block text-small font-medium" htmlFor="payout-reason">Lý do từ chối <span className="font-normal text-ink-muted">(gửi cho mentor)</span></label>
      <Textarea id="payout-reason" rows={3} maxLength={500} value={reason} className="mt-1" onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

export default function AdminPayoutsPage() {
  return <RequireAuth roles={["ADMIN"]}>{() => <Payouts />}</RequireAuth>;
}
