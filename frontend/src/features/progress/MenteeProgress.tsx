"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";
import { TrendingDown, TrendingUp } from "lucide-react";
import { ArrowRight, CalendarDays, CheckCircle2, Circle, LineChart, ListChecks, MessageSquareQuote, Target } from "lucide-react";
import { Avatar, Badge, ButtonLink, EmptyState } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { progressApi, type FeedbackSummary, type MenteeScore } from "@/features/progress/api";
import { formatDateTime } from "@/lib/format";
import type { ActionItem, MentoringSession } from "@/types";

/** Điểm mentor chấm mentee sau một phiên (thang 1–5) — lấy từ features/progress/api.ts. */
type ScorePoint = MenteeScore;

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1).replace(".", ","));

/** Chuỗi tuần liên tiếp (tính lùi từ tuần hiện tại, cho phép tuần hiện tại còn trống) có ít nhất một phiên đã học. */
function weekStreak(done: MentoringSession[]): number {
  const WEEK = 7 * 86400000;
  const weekOf = (t: number) => Math.floor((t - 4 * 86400000) / WEEK);
  const weeks = new Set(done.map((s) => weekOf(new Date(s.scheduledAt).getTime())));
  let w = weekOf(Date.now());
  if (!weeks.has(w)) w -= 1;
  let n = 0;
  while (weeks.has(w)) { n += 1; w -= 1; }
  return n;
}

function ScoreChart({ points }: { points: ScorePoint[] }) {
  const W = 740, H = 270, L = 40, R = 720, T = 20, B = 200;
  const x = (i: number) => (points.length === 1 ? (L + R) / 2 : L + (i * (R - L)) / (points.length - 1));
  const y = (v: number) => B - ((v - 1) / 4) * (B - T);
  const line = (k: "preparation" | "participation") => points.map((p, i) => `${x(i)},${y(p[k])}`).join(" ");
  const label = `Biểu đồ đường điểm chuẩn bị và tham gia qua ${points.length} phiên. Chuẩn bị từ ${points[0].preparation} đến ${points[points.length - 1].preparation}, tham gia từ ${points[0].participation} đến ${points[points.length - 1].participation}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      <g stroke="var(--border)" strokeWidth="1">{[1, 2, 3, 4, 5].map((v) => <line key={v} x1={L} x2={R} y1={y(v)} y2={y(v)} />)}</g>
      <g fontSize="16" fill="var(--ink-muted)" textAnchor="end">{[1, 2, 3, 4, 5].map((v) => <text key={v} x={L - 10} y={y(v) + 6}>{v}</text>)}</g>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="4" strokeDasharray="7 4" points={line("participation")} />
      <polyline fill="none" stroke="var(--accent-ink)" strokeWidth="4" points={line("preparation")} />
      {points.map((p, i) => (
        <g key={p.sessionId}>
          <rect x={x(i) - 7} y={y(p.participation) - 7} width="14" height="14" fill="var(--accent)" />
          <circle cx={x(i)} cy={y(p.preparation)} r="7" fill="var(--accent-ink)" />
          <text x={x(i)} y={B + 32} fontSize="16" fill={i === points.length - 1 ? "var(--ink)" : "var(--ink-muted)"} fontWeight={i === points.length - 1 ? 700 : 400} textAnchor="middle">P{i + 1}</text>
          {points.length <= 8 && <text x={x(i)} y={B + 54} fontSize="14" fill="var(--ink-muted)" textAnchor="middle">{new Date(p.date).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" })}</text>}
        </g>
      ))}
    </svg>
  );
}

/** Một câu nhận định từ điểm: phiên đầu so với phiên gần nhất. */
function insight(points: ScorePoint[]): string {
  const first = points[0], last = points[points.length - 1];
  const dp = last.preparation - first.preparation, dt = last.participation - first.participation;
  if (dp <= 0 && dt <= 0) return "điểm đang đi ngang, thử đặt mục tiêu nhỏ cho phiên tới cùng mentor.";
  return dt >= dp
    ? `tham gia tăng nhanh nhất (${first.participation} lên ${last.participation}), chuẩn bị ${first.preparation} lên ${last.preparation}.`
    : `chuẩn bị tăng nhanh nhất (${first.preparation} lên ${last.preparation}), tham gia ${first.participation} lên ${last.participation}.`;
}

function TagGroup({ title, tags, tone }: { title: string; tags: FeedbackSummary["strengths"]; tone: "success" | "warning" }) {
  if (tags.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-small font-semibold uppercase tracking-wide text-ink-muted">{title}</div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => <Badge key={t.label} tone={tone}>{t.label} ×{t.count}</Badge>)}
      </div>
    </div>
  );
}

/**
 * Khối "Tiến độ" cho mentee trên Tổng quan: số phiên đã học, chuỗi tuần, mục tiêu, việc cần làm lấy từ ghi chú phiên,
 * và (khi có) biểu đồ điểm mentor chấm sau mỗi phiên. Dữ liệu dựng từ API mentoringApi có sẵn.
 */
const PERIODS: [string, string, number][] = [["1", "1 tháng gần nhất", 30], ["3", "3 tháng gần nhất", 92], ["6", "6 tháng gần nhất", 183], ["all", "Tất cả", 0]];
type SessTab = "latest" | "high" | "improve";

export default function MenteeProgress({ sessions, goal, name }: { sessions: MentoringSession[]; goal?: string | null; name?: string | null }) {
  const done = useMemo(
    () => sessions.filter((s) => s.status === "COMPLETED").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
    [sessions],
  );
  const upcoming = useMemo(
    () => sessions.filter((s) => s.status === "CONFIRMED" && new Date(s.scheduledAt) > new Date())
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0],
    [sessions],
  );
  const [allScores, setScores] = useState<ScorePoint[]>([]);
  const [mentorFilter, setMentorFilter] = useState("");
  const [period, setPeriod] = useState("3");
  const [tab, setTab] = useState<SessTab>("latest");
  const [showAll, setShowAll] = useState(false);
  const mentorNames = useMemo(() => [...new Set(allScores.map((s) => s.mentorName))], [allScores]);
  const scores = useMemo(() => {
    const days = PERIODS.find(([v]) => v === period)?.[2] ?? 0;
    const from = days ? Date.now() - days * 86400000 : 0;
    return allScores.filter((s) => (!mentorFilter || s.mentorName === mentorFilter) && new Date(s.date).getTime() >= from);
  }, [allScores, mentorFilter, period]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [todos, setTodos] = useState<ActionItem[]>([]);
  const menteeId = sessions[0]?.menteeId;
  const recentIds = done.slice(-3).map((s) => s.id).join(",");

  useEffect(() => {
    let live = true;
    if (menteeId) {
      progressApi.listScores(menteeId).then((p) => live && setScores(p)).catch(() => {});
      progressApi.feedbackSummary(menteeId).then((p) => live && setSummary(p)).catch(() => {});
    }
    if (recentIds) {
      Promise.all(recentIds.split(",").map((id) => mentoringApi.sessionNotes(id).catch(() => null))).then((all) => {
        if (!live) return;
        setTodos(all.flatMap((n) => n?.actionItems ?? []).filter((a) => a.owner === "MENTEE"));
      });
    }
    return () => { live = false; };
  }, [recentIds, menteeId]);

  const mentors = new Set(done.map((s) => s.mentorId)).size;
  const open = todos.filter((t) => !t.done);
  const streak = weekStreak(done);
  const mean = (p: ScorePoint) => (p.preparation + p.participation) / 2;
  const recent = scores.length ? avg(scores.slice(-3).map(mean)) : null;
  const trend = scores.length > 3 && recent !== null ? recent - (avg(scores.slice(0, 3).map(mean)) ?? 0) : null;
  const latestComment = [...scores].reverse().find((s) => s.comment);

  const prep = avg(scores.map((s) => s.preparation));
  const eng = avg(scores.map((s) => s.participation));

  if (done.length === 0) {
    return (
      <section className="ses-sec" aria-label="Tiến độ">
        <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><LineChart /></span>Tiến độ</h2></div>
        <EmptyState icon={LineChart} title="Hoàn thành phiên đầu tiên để xem tiến độ"
          action={<ButtonLink href="/matching" variant="primary" size="sm">Tìm mentor</ButtonLink>}>
          Điểm chuẩn bị và tham gia từ mentor hiện sau mỗi phiên. Biểu đồ cần tối thiểu 2 phiên có đánh giá của mentor.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Tiến độ">
      <div className="prog-head">
        <div>
          <h2 className="prog-hello">Chào {name ? name.trim().split(/\s+/).pop() : "bạn"}, {trend === null || trend >= 0 ? "bạn đang tiến bộ tốt" : "hãy cùng cải thiện nhé"}</h2>
          <p className="text-small text-ink-muted">Số liệu lấy từ đánh giá của mentor sau mỗi phiên học.</p>
        </div>
        <div className="prog-filters">
          <label>Mentor
            <Select aria-label="Lọc theo mentor" value={mentorFilter} onChange={(e) => { setMentorFilter(e.target.value); setShowAll(false); }}>
              <option value="">Tất cả ({mentorNames.length})</option>
              {mentorNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <label>Kỳ xem
            <Select aria-label="Kỳ xem" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </label>
        </div>
      </div>
      {scores.length > 0 && recent !== null && (
        <div className="prog-hero" role="group" aria-label="Điểm trung bình gần đây">
          <div>
            <div className="prog-hero-l">Điểm trung bình gần đây</div>
            <div className="prog-hero-v">{fmt(recent)}<span> / 5</span></div>
          </div>
          {trend !== null && scores.length > 3 && (
            <div className="prog-hero-d">{trend >= 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}{trend >= 0 ? "+" : ""}{trend.toFixed(1).replace(".", ",")} so với 3 phiên đầu</div>
          )}
        </div>
      )}
      <div className="ses-sec">
        <div className="ses-sec-head">
          <h2><span className="ses-ico" aria-hidden="true"><LineChart /></span>Tiến độ</h2>
          <span className="text-small text-ink-muted">Số liệu lấy từ đánh giá của mentor sau mỗi phiên học</span>
        </div>
        <div className="ses-sec-body flex flex-col gap-4">
          <div className="ses-prog-grid">
            <div className="ses-prog-stat"><div className="l">Phiên đã học</div><div className="v">{done.length}</div><div className="h">{mentors} mentor{streak > 1 ? ` · chuỗi ${streak} tuần liên tiếp` : ""}{summary?.punctualityRate != null ? ` · ${summary.punctualityRate}% đúng giờ` : ""}</div></div>
            <div className="ses-prog-stat"><div className="l">Chuẩn bị bài</div><div className="v">{fmt(prep)}{prep !== null && <span className="text-small font-normal text-ink-muted"> / 5</span>}</div><div className="h">{prep === null ? "Chờ đánh giá của mentor" : "Trung bình các phiên"}</div></div>
            <div className="ses-prog-stat"><div className="l">Tham gia trong buổi</div><div className="v">{fmt(eng)}{eng !== null && <span className="text-small font-normal text-ink-muted"> / 5</span>}</div><div className="h">{eng === null ? "Chờ đánh giá của mentor" : "Trung bình các phiên"}</div></div>
          </div>
          {scores.length >= 2 ? (
            <>
              <div className="ses-legend"><span><i />Chuẩn bị</span><span><i className="dash" />Tham gia</span></div>
              <ScoreChart points={scores} />
              <p className="prog-insight"><b>Nhận định:</b> {insight(scores)}</p>
            </>
          ) : (
            <p className="text-small text-ink-muted">Biểu đồ điểm qua từng phiên hiện khi có tối thiểu 2 phiên được mentor đánh giá.</p>
          )}
        </div>
      </div>

      {scores.length > 0 && (() => {
        const numbered = scores.map((p, i) => ({ p, n: i + 1 }));
        const list = tab === "latest" ? [...numbered].reverse()
          : tab === "high" ? [...numbered].sort((a, b) => mean(b.p) - mean(a.p) || b.n - a.n)
            : [...numbered].sort((a, b) => mean(a.p) - mean(b.p) || b.n - a.n);
        const visible = showAll ? list : list.slice(0, 4);
        const tabs: [SessTab, string][] = [["latest", "Mới nhất"], ["high", "Điểm cao"], ["improve", "Cần cải thiện"]];
        return (
          <section className="prog-sessions" aria-label="Từng phiên học">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-title-2 font-semibold">Từng phiên học</h2>
              <div className="seg" role="radiogroup" aria-label="Sắp xếp phiên học">
                {tabs.map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={tab === id} onClick={() => setTab(id)}>{l}</button>)}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map(({ p, n }) => {
                const prev = scores[n - 2];
                const delta = prev ? p.participation - prev.participation : 0;
                return (
                  <article key={p.sessionId} className="prog-sess" data-latest={n === scores.length}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <Avatar name={p.mentorName} size="sm" />
                        <div className="min-w-0">
                          <b className="block">Phiên {n}{p.topic ? ` · ${p.topic}` : ""}</b>
                          <span className="text-small text-ink-muted">{new Date(p.date).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" })} · {p.mentorName}</span>
                        </div>
                      </div>
                      {n === scores.length ? <Badge tone="accent">Mới nhất</Badge> : mean(p) <= 3.5 ? <Badge tone="warning">Cần cải thiện</Badge> : null}
                    </div>
                    <div className="prog-sess-scores">
                      <span>Chuẩn bị <b>{p.preparation}</b></span>
                      <span>Tham gia <b>{p.participation}</b>{delta > 0 && <em className="prog-up"> ▲{delta}</em>}</span>
                    </div>
                    {p.comment && <blockquote>{p.comment}</blockquote>}
                    <Link href={`/mentoring/sessions/${p.sessionId}/notes`} className="prog-sess-link">Xem ghi chú phiên &rarr;</Link>
                  </article>
                );
              })}
            </div>
            {list.length > 4 && (
              <button type="button" className="prog-all w-full" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Thu gọn" : `Xem cả ${list.length} phiên`}
              </button>
            )}
          </section>
        );
      })()}

      <div className="grid items-start gap-4 md:grid-cols-2">
        {goal && (
          <div className="ses-sec">
            <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><Target /></span>Mục tiêu</h2></div>
            <div className="ses-sec-body">
              <p className="font-semibold">{goal}</p>
              <p className="mt-2 text-small text-ink-muted">Đã học {done.length} phiên với {mentors} mentor.</p>
              <Link href="/mentoring/sessions" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-small font-semibold">Xem các phiên đã học <ArrowRight className="size-4" aria-hidden="true" /></Link>
            </div>
          </div>
        )}
        {(summary || latestComment) && (
          <div className="ses-sec">
            <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><MessageSquareQuote /></span>Mentor nhận xét về bạn</h2></div>
            <div className="ses-sec-body flex flex-col gap-3">
              {summary && (
                <>
                  <TagGroup title="Điểm mạnh" tags={summary.strengths} tone="success" />
                  <TagGroup title="Nên cải thiện" tags={summary.improvements} tone="warning" />
                </>
              )}
              {latestComment && (
                <blockquote className="rounded-md bg-surface-sunken p-3 text-small">
                  {latestComment.comment}
                  <footer className="mt-1 text-ink-muted">— {latestComment.mentorName}, {new Date(latestComment.date).toLocaleDateString("vi-VN")}</footer>
                </blockquote>
              )}
              <p className="text-small text-ink-muted">Tổng hợp từ nhận xét của mentor qua các phiên.</p>
            </div>
          </div>
        )}
        <div className="ses-sec">
          <div className="ses-sec-head">
            <h2><span className="ses-ico" aria-hidden="true"><ListChecks /></span>Việc cần làm</h2>
            <span className="text-small text-ink-muted">{open.length} việc mở</span>
          </div>
          <div className="ses-sec-body">
            {todos.length === 0 ? (
              <p className="text-small text-ink-muted">Việc mentor giao sau mỗi phiên hiện ở đây.</p>
            ) : (
              <ul>
                {todos.slice(0, 5).map((t) => (
                  <li key={t.id} className="ses-todo" data-done={t.done}>
                    <Link href={`/mentoring/sessions/${t.sessionId}/notes`} className="flex min-h-[44px] items-center gap-2 text-ink">
                      {t.done ? <CheckCircle2 aria-label="Đã xong" className="size-5 flex-none text-success" /> : <Circle aria-label="Chưa xong" className="size-5 flex-none text-ink-subtle" />}
                      <span>{t.text}{t.dueDate && !t.done ? <span className="block text-small text-ink-muted">Hạn {new Date(t.dueDate).toLocaleDateString("vi-VN")}</span> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {upcoming && (
          <div className="ses-sec">
            <div className="ses-sec-head"><h2><span className="ses-ico" aria-hidden="true"><CalendarDays /></span>Phiên tiếp theo</h2></div>
            <div className="ses-sec-body flex items-center gap-3">
              <Avatar name={upcoming.mentorName} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{upcoming.mentorName}</div>
                <div className="text-small text-ink-muted">{formatDateTime(upcoming.scheduledAt)}</div>
              </div>
              <ButtonLink href={`/mentoring/sessions/${upcoming.id}`} size="sm">Xem chi tiết</ButtonLink>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
