"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Loading, PageHead, StatusBadge } from "@/components/ui";
import { paymentApi } from "@/features/payment/api";
import { formatDateTime, formatMoney } from "@/lib/format";

const REJECT_REASONS = {
  REFERRER_IS_SESSION_MENTOR: "Người giới thiệu là mentor của giao dịch",
  DAILY_LIMIT_EXCEEDED: "Vượt giới hạn số lượt thưởng trong ngày",
};

function Referral() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    paymentApi.myReferral().then(setData);
  }, []);
  if (!data) return <Loading />;

  return (
    <>
      <PageHead title="Giới thiệu bạn bè" subtitle="Nhận điểm thưởng khi người được bạn giới thiệu có giao dịch hợp lệ đầu tiên." />
      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <div className="card"><div className="stat-label">Mã của bạn</div><div className="stat" style={{ letterSpacing: 2 }}>{data.code}</div></div>
        <div className="card"><div className="stat-label">Đã giới thiệu</div><div className="stat">{data.totalReferrals}</div></div>
        <div className="card"><div className="stat-label">Hợp lệ</div><div className="stat">{data.qualifiedReferrals}</div></div>
        <div className="card"><div className="stat-label">Điểm thưởng</div><div className="stat" style={{ color: "var(--good)" }}>{data.pointsBalance}</div></div>
      </div>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Chia sẻ liên kết</h2>
          <div className="row">
            <input readOnly value={data.shareUrl} />
            <button className="btn" onClick={() => navigator.clipboard.writeText(data.shareUrl).then(() => setCopied(true))}>{copied ? "Đã sao chép" : "Sao chép"}</button>
          </div>
          <h3 style={{ marginTop: "1rem" }}>Quy tắc</h3>
          <ul className="small">
            <li>Mỗi lượt giới thiệu hợp lệ được <strong>{data.rewardPointsPerReferral} điểm</strong>.</li>
            <li>Người được giới thiệu phải đăng ký bằng mã của bạn và có giao dịch thành công đầu tiên từ {formatMoney(data.minQualifyingAmount)}.</li>
            <li>Không tính khi bạn chính là mentor nhận thanh toán của giao dịch đó.</li>
            <li>Mỗi tài khoản chỉ được ghi nhận giới thiệu một lần; có giới hạn số lượt thưởng mỗi ngày.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Người bạn đã giới thiệu</h2>
          {data.referrals.length === 0 && <p className="muted">Chưa có ai.</p>}
          {data.referrals.map((r) => (
            <div key={r.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="small">Người dùng #{r.refereeId.slice(0, 8)}</div>
                <div className="muted small">{formatDateTime(r.createdAt)}{r.rejectReason && ` · ${REJECT_REASONS[r.rejectReason] || r.rejectReason}`}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
          <h3 style={{ marginTop: "1rem" }}>Lịch sử điểm</h3>
          {data.rewards.length === 0 && <p className="muted small">Chưa có điểm thưởng.</p>}
          {data.rewards.map((e) => (
            <div key={e.id} className="row between small list-item">
              <span>{e.reason}</span>
              <strong style={{ color: "var(--good)" }}>+{e.points}</strong>
            </div>
          ))}
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
