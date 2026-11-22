"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Copy, Check, Gift, Share2, Ticket } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Input, List, ListRow, Loading, PageHeader, Stat, Stats, StatusBadge } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { referralApi } from "@/features/referral/api";
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

function CodeRow({ mentorId, mentorName, code, shareUrl }: { mentorId: string; mentorName: string; code: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ob-code">
      <div className="flex flex-wrap items-center gap-3">
        <span className="ob-avatar" aria-hidden="true">{mentorName.split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase()}</span>
        <strong className="flex-1">{mentorName}</strong>
        <span className="ob-code-val">{code}</span>
      </div>
      <div className="input-group">
        <Input readOnly value={shareUrl} aria-label={`Liên kết giới thiệu ${mentorName}`} className="font-mono text-small" onFocus={(e) => e.target.select()} />
        <Button variant="primary" icon={copied ? Check : Copy}
          onClick={() => navigator.clipboard?.writeText(`${shareUrl} — mã ${code}`).then(() => setCopied(true)).catch(() => {})}>{copied ? "Đã sao chép" : "Sao chép"}</Button>
        <ButtonLink href={`/referral/share?mentor=${encodeURIComponent(mentorId)}`} icon={Share2}>Chia sẻ</ButtonLink>
      </div>
    </div>
  );
}

/** Bản chốt v2.0 §11 — giới thiệu theo từng mentor; thưởng bằng tiền khuyến mãi sau khi buổi học hoàn thành + 7 ngày không hoàn tiền. */
function Referral() {
  const [data, setData] = useState<MyMentorReferrals | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [vouchers, setVouchers] = useState<number | null>(null);
  useEffect(() => {
    referralApi.vouchers().then((vs) => setVouchers(vs.filter((v) => v.status === "ACTIVE").length)).catch(() => setVouchers(null));
    paymentApi.myReferral().then(setData).catch((e) => { setError(errorMessage(e)); setData(null); });
  }, []);
  if (data === undefined) return <Loading />;
  if (!data) return <Alert>{error || "Không tải được thông tin giới thiệu."}</Alert>;

  return (
    <>
      <section className="ob-hero mb-6" aria-label="Giới thiệu bạn bè">
        <div>
          <h2>Giới thiệu mentor tốt cho bạn bè, nhận thưởng</h2>
          <p>Mỗi mentor bạn đã học xong ít nhất một buổi có một mã giới thiệu riêng. Khi bạn bè học xong buổi đầu với mentor đó, bạn nhận {formatMoney(data.reward)} tiền khuyến mãi.</p>
          <div className="mt-3"><ButtonLink href="/referral/share" icon={Share2}>Chọn mentor để giới thiệu</ButtonLink></div>
          {/* Số mã giảm giá lấy từ referralApi (mock tới khi backend có); tiền thưởng vẫn theo backend hiện tại. */}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="ob-hero-stat"><Gift aria-hidden="true" className="mx-auto mb-1 size-5" /><b>{formatMoney(data.earned)}</b><span className="text-small">Thưởng đã nhận</span></div>
          {vouchers !== null && (
            <div className="ob-hero-stat"><Ticket aria-hidden="true" className="mx-auto mb-1 size-5" /><b>{vouchers}</b><span className="text-small">Mã giảm giá đang có</span>
              <Link href="/referral/vouchers" className="rf-hero-link">Xem mã của tôi</Link></div>
          )}
        </div>
      </section>
      <ol className="ob-how mb-6" aria-label="Cách hoạt động">
        <li><span className="ob-dot">1</span><div><strong>Chia sẻ mã của mentor</strong><div className="text-small text-ink-muted">Gửi liên kết hoặc mã cho bạn bè đang cần mentor.</div></div></li>
        <li><span className="ob-dot">2</span><div><strong>Bạn bè đặt buổi đầu tiên</strong><div className="text-small text-ink-muted">Nhập mã khi gửi yêu cầu mentoring với mentor đó.</div></div></li>
        <li><span className="ob-dot">3</span><div><strong>Bạn nhận thưởng</strong><div className="text-small text-ink-muted">{formatMoney(data.reward)} sau {data.pendingDays} ngày kể từ khi buổi học hoàn thành, không bị hoàn tiền.</div></div></li>
      </ol>
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
            ) : data.codes.map((c) => <CodeRow key={c.mentorId} mentorId={c.mentorId} mentorName={c.mentorName} code={c.code} shareUrl={c.shareUrl} />)}
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
