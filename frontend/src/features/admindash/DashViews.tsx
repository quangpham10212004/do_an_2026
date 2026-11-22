"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BarChart3, Star, Table2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { SERVICE_LABELS, type ActivityItem, type DashKpis, type GmvPoint, type ServiceStatus, type TopMentor } from "./api";

const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** 38.000.000 -> "38tr"; 18.400.000 -> "18,4 triệu". */
export const compactMillions = (n: number, long = false) => `${nf1.format(n / 1_000_000)}${long ? " triệu" : "tr"}`;

export function timeAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
}

/** Hiển thị phần in đậm trong mô tả hoạt động. */
function RichText({ text }: { text: string }) {
  return <>{text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}

function Delta({ dir, good, children }: { dir: "up" | "down"; good: boolean; children: ReactNode }) {
  const Icon = dir === "up" ? ArrowUp : ArrowDown;
  return (
    <span className={`adm-delta ${good ? "good" : "bad"}`}>
      <Icon aria-hidden="true" className="size-3" />
      <span className="sr-only">{dir === "up" ? "Tăng" : "Giảm"} </span>
      {children}
    </span>
  );
}

function DashKpi({ label, value, children, tone }: { label: string; value: ReactNode; children?: ReactNode; tone?: "brand" }) {
  return (
    <div className={`adm-kpi adm-kpi-lg${tone === "brand" ? " brand" : ""}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {children && <div className="h">{children}</div>}
    </div>
  );
}

const pct = (n: number) => nf1.format(Math.abs(n));

export function DashKpiRow({ k, sessions }: { k: DashKpis | null; sessions: number | null }) {
  const dash = "—";
  return (
    <div className="adm-kpis adm-kpis-dash">
      <DashKpi label="Người dùng mới" value={k ? k.newUsers.total : dash}>
        {k && <>{k.newUsers.deltaPercent !== null && <><Delta dir={k.newUsers.deltaPercent >= 0 ? "up" : "down"} good={k.newUsers.deltaPercent >= 0}>{pct(k.newUsers.deltaPercent)}%</Delta> · </>}{k.newUsers.mentees} mentee, {k.newUsers.mentors} mentor</>}
      </DashKpi>
      <DashKpi label="Mentor đang nhận" value={k ? k.activeMentors.accepting : dash}>{k && `/ ${k.activeMentors.verified} mentor đã xác thực`}</DashKpi>
      <DashKpi label="Phiên hoàn thành" value={k ? k.completedSessions.total : sessions ?? dash}>
        {k && k.completedSessions.deltaPercent !== null && <Delta dir={k.completedSessions.deltaPercent >= 0 ? "up" : "down"} good={k.completedSessions.deltaPercent >= 0}>{pct(k.completedSessions.deltaPercent)}%</Delta>}
      </DashKpi>
      <DashKpi label="Doanh thu nền tảng" value={k ? compactMillions(k.platformRevenue.amount, true) : dash} tone="brand">
        {k && `${k.platformRevenue.feePercent}% của GMV ${compactMillions(k.platformRevenue.gmv, true)}`}
      </DashKpi>
      <DashKpi label="Tỉ lệ hoàn tiền" value={k ? `${nf1.format(k.refundRate.percent)}%` : dash}>
        {k && <Delta dir={k.refundRate.deltaPoints <= 0 ? "down" : "up"} good={k.refundRate.deltaPoints <= 0}>{pct(k.refundRate.deltaPoints)} điểm</Delta>}
      </DashKpi>
    </div>
  );
}

export function GmvChart({ points }: { points: GmvPoint[] }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...points.map((p) => p.amount));
  const last = points.length - 1;
  const summary = `Biểu đồ cột GMV ${points.length} tuần: ${points.map((p) => compactMillions(p.amount)).join(", ")}`;
  return (
    <div>
      <div className="adm-chart-tools">
        <button type="button" className="btn btn-sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? <BarChart3 aria-hidden="true" className="size-4" /> : <Table2 aria-hidden="true" className="size-4" />}
          {asTable ? "Xem biểu đồ" : "Xem dạng bảng"}
        </button>
      </div>
      {asTable ? (
        <div className="adm-scroll">
          <table className="adm-mini-table">
            <caption className="sr-only">GMV theo tuần</caption>
            <thead><tr><th scope="col">Tuần</th><th scope="col" className="r">GMV</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td className="r">{formatMoney(p.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <>
          <svg className="adm-gmv" viewBox={`0 0 ${points.length * 40} 150`} role="img" aria-label={summary} preserveAspectRatio="none">
            {points.map((p, i) => {
              const h = Math.max(2, (p.amount / max) * 120);
              const x = i * 40 + 6;
              return <rect key={p.label} x={x} y={150 - h} width={28} height={h} rx={4} className={i === last ? "bar-hi" : i === last - 1 ? "bar-mid" : "bar-lo"} />;
            })}
          </svg>
          <ol className="adm-gmv-labels" aria-hidden="true">
            {points.map((p, i) => (
              <li key={p.label} className={i === last ? "cur" : undefined}>
                <span className="amt">{compactMillions(p.amount)}</span>
                <span>{p.label.replace("Tuần ", "T")}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function TopMentors({ rows }: { rows: TopMentor[] | null }) {
  return (
    <div className="adm-scroll">
      <table className="adm-mini-table">
        <thead><tr><th scope="col">Mentor</th><th scope="col">Phiên</th><th scope="col">Đánh giá</th><th scope="col" className="r">GMV</th></tr></thead>
        <tbody>
          {(rows ?? []).map((m) => (
            <tr key={m.id}>
              <th scope="row">{m.name}</th>
              <td>{m.sessions}</td>
              <td className="rate"><Star aria-hidden="true" className="size-3.5" fill="currentColor" /> {m.rating.toFixed(1)}</td>
              <td className="r">{formatMoney(m.gmv)}</td>
            </tr>
          ))}
          {rows && !rows.length && <tr><td colSpan={4} className="empty">Chưa có dữ liệu.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityList({ items }: { items: ActivityItem[] | null }) {
  return (
    <>
      <ul className="adm-activity">
        {(items ?? []).map((a) => (
          <li key={a.id}>
            <span aria-hidden="true" className={`dot ${a.tone}`} />
            <div><RichText text={a.text} /><time dateTime={a.at}>{timeAgo(a.at)}</time></div>
          </li>
        ))}
        {items && !items.length && <li className="empty">Chưa có hoạt động.</li>}
      </ul>
      <Link href="/admin/audit" className="adm-more">Xem nhật ký →</Link>
    </>
  );
}

export function ServiceList({ items }: { items: ServiceStatus[] | null }) {
  return (
    <ul className="adm-services">
      {(items ?? []).map((s) => (
        <li key={s.id}>
          <span>{s.name}</span>
          <span className={`st ${s.state.toLowerCase()}`}><span aria-hidden="true">● </span>{SERVICE_LABELS[s.state]}</span>
        </li>
      ))}
    </ul>
  );
}
