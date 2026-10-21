"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Copy, Check } from "lucide-react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Input, List, ListRow, Loading, PageHeader, Stat, Stats, StatusBadge } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MyMentorReferrals } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Chờ buổi học hoàn thành",
  UNDER_REVIEW: "Đang được xem xét",
  QUALIFIED: "Đã thưởng",
  CAPPED: "Vượt trần thưởng tháng",
  REJECTED: "Không được thưởng",
};
const REJECT_REASONS: Record<string, string> = {
  SESSION_REFUNDED: "Buổi học bị hoàn tiền",
  SESSION_NOT_COMPLETED: "Buổi học không hoàn thành",
  MONTHLY_CAP: "Đã đủ số lượt thưởng trong tháng",
};

function CodeRow({ mentorName, code, shareUrl }: { mentorName: string; code: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{mentorName}</strong>
        <span className="font-mono tracking-[0.12em]">{code}</span>
      </div>
      <div className="input-group">
        <Input readOnly value={shareUrl} aria-label={`Liên kết giới thiệu ${mentorName}`} className="font-mono text-small" onFocus={(e) => e.target.select()} />
        <Button variant="primary" icon={copied ? Check : Copy}
          onClick={() => navigator.clipboard?.writeText(`${shareUrl} — mã ${code}`).then(() => setCopied(true)).catch(() => {})}>{copied ? "Đã sao chép" : "Sao chép"}</Button>
      </div>
    </div>
  );
}

/** Bản chốt v2.0 §11 — giới thiệu theo từng mentor; thưởng bằng tiền khuyến mãi sau khi buổi học hoàn thành + 7 ngày không hoàn tiền. */
function Referral() {
  const [data, setData] = useState<MyMentorReferrals | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    paymentApi.myReferral().then(setData).catch((e) => { setError(errorMessage(e)); setData(null); });
  }, []);
  if (data === undefined) return <Loading />;
  if (!data) return <Alert>{error || "Không tải được thông tin giới thiệu."}</Alert>;

  return (
    <>
      <PageHeader title="Giới thiệu bạn bè" description={`Mã giới thiệu riêng cho từng mentor bạn đã học xong ít nhất một buổi. Bạn nhận ${formatMoney(data.reward)} tiền khuyến mãi cho mỗi người được giới thiệu học xong buổi đầu.`} />
      <div className="mb-6">
        <Stats>
          <Stat label="Mã của bạn" value={data.codes.length} />
          <Stat label="Đã giới thiệu" value={data.referrals.length} />
          <Stat label="Đã thưởng tháng này" value={`${data.qualifiedThisMonth}/${data.monthlyCap}`} />
          <Stat label="Tiền thưởng đã nhận" value={formatMoney(data.earned)} />
        </Stats>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mã theo mentor" />
          <CardBody className="flex flex-col gap-4">
            {data.codes.length === 0 ? (
              <EmptyState title="Chưa có mã giới thiệu">Hoàn thành ít nhất một buổi học đã trả tiền với một mentor để nhận mã dành riêng cho mentor đó.</EmptyState>
            ) : data.codes.map((c) => <CodeRow key={c.mentorId} mentorName={c.mentorName} code={c.code} shareUrl={c.shareUrl} />)}
            <div>
              <div className="eyebrow mb-2">Quy tắc</div>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink-muted">
                <li>Người mới nhập mã khi đặt <strong className="text-ink">buổi học thường đầu tiên</strong> với đúng mentor đó (không được giảm giá); người đã học với mentor đó hoặc tự giới thiệu không áp dụng.</li>
                <li>Thưởng <strong className="text-ink">{formatMoney(data.reward)}</strong> tiền khuyến mãi (dùng trong nền tảng, hết hạn sau 12 tháng) sau khi buổi học hoàn thành và qua {data.pendingDays} ngày không bị hoàn tiền.</li>
                <li>Tối đa {data.monthlyCap} lượt thưởng mỗi tháng; lượt bất thường được quản trị viên xem xét.</li>
              </ul>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Người bạn đã giới thiệu" />
          {data.referrals.length === 0 ? <EmptyState title="Chưa có ai">Chia sẻ mã để mời bạn bè học với mentor của bạn.</EmptyState> : (
            <List>
              {data.referrals.map((r) => (
                <ListRow key={r.id}
                  title={<span className="font-mono text-small">#{r.refereeId.slice(0, 8)}</span>}
                  meta={<>{formatDateTime(r.createdAt)}{r.rejectReason && ` · ${REJECT_REASONS[r.rejectReason] || r.rejectReason}`}{r.rewardAmount ? ` · +${formatMoney(r.rewardAmount)}` : ""}</>}
                  trailing={<span title={STATUS_LABELS[r.status]}><StatusBadge status={r.status} /></span>} />
              ))}
            </List>
          )}
        </Card>
      </div>
    </>
  );
}

export default function ReferralPage() {
  return (
    <RequireAuth>
      <Referral />
    </RequireAuth>
  );
}
