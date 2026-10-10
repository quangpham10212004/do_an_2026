"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Copy, Check } from "lucide-react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Input, List, ListRow, Loading, PageHeader, Stat, Stats, StatusBadge } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MyReferral, ReferralRejectReason } from "@/types";

const REJECT_REASONS: Record<ReferralRejectReason, string> = {
  REFERRER_IS_SESSION_MENTOR: "Người giới thiệu là mentor của giao dịch",
  DAILY_LIMIT_EXCEEDED: "Vượt giới hạn số lượt thưởng trong ngày",
};

function Referral() {
  const [data, setData] = useState<MyReferral | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    paymentApi.myReferral().then(setData).catch((e) => { setError(errorMessage(e)); setData(null); });
  }, []);
  if (data === undefined) return <Loading />;
  if (!data) return <Alert>{error || "Không tải được thông tin giới thiệu."}</Alert>;

  return (
    <>
      <PageHeader title="Giới thiệu bạn bè" description="Nhận điểm thưởng khi người được bạn giới thiệu có giao dịch hợp lệ đầu tiên." />
      <div className="mb-6">
        <Stats>
          <Stat label="Mã của bạn" value={<span className="tracking-[0.12em]">{data.code}</span>} />
          <Stat label="Đã giới thiệu" value={data.totalReferrals} />
          <Stat label="Hợp lệ" value={data.qualifiedReferrals} />
          <Stat label="Điểm thưởng" value={data.pointsBalance} />
        </Stats>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Chia sẻ liên kết" />
          <CardBody className="flex flex-col gap-5">
            <div className="input-group">
              <Input readOnly value={data.shareUrl} aria-label="Liên kết giới thiệu" className="font-mono text-small" onFocus={(e) => e.target.select()} />
              <Button variant="primary" icon={copied ? Check : Copy}
                onClick={() => navigator.clipboard?.writeText(data.shareUrl).then(() => setCopied(true)).catch(() => {})}>{copied ? "Đã sao chép" : "Sao chép"}</Button>
            </div>
            <div>
              <div className="eyebrow mb-2">Quy tắc</div>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink-muted">
                <li>Mỗi lượt giới thiệu hợp lệ được <strong className="text-ink">{data.rewardPointsPerReferral} điểm</strong>.</li>
                <li>Người được giới thiệu đăng ký bằng mã của bạn và có giao dịch thành công đầu tiên từ {formatMoney(data.minQualifyingAmount)}.</li>
                <li>Không tính khi bạn chính là mentor nhận thanh toán của giao dịch đó.</li>
                <li>Mỗi tài khoản chỉ được ghi nhận giới thiệu một lần; có giới hạn số lượt thưởng mỗi ngày.</li>
              </ul>
            </div>
          </CardBody>
        </Card>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Người bạn đã giới thiệu" />
            {data.referrals.length === 0 ? <EmptyState title="Chưa có ai">Chia sẻ liên kết để mời bạn bè.</EmptyState> : (
              <List>
                {data.referrals.map((r) => (
                  <ListRow key={r.id}
                    title={<span className="font-mono text-small">#{r.refereeId.slice(0, 8)}</span>}
                    meta={<>{formatDateTime(r.createdAt)}{r.rejectReason && ` · ${REJECT_REASONS[r.rejectReason] || r.rejectReason}`}</>}
                    trailing={<StatusBadge status={r.status} />} />
                ))}
              </List>
            )}
          </Card>
          <Card>
            <CardHeader title="Lịch sử điểm" />
            {data.rewards.length === 0 ? <EmptyState title="Chưa có điểm thưởng" /> : (
              <List>
                {data.rewards.map((e) => (
                  <ListRow key={e.id} title={e.reason} trailing={<span className="font-mono font-medium text-success tabular">+{e.points}</span>} />
                ))}
              </List>
            )}
          </Card>
        </div>
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
