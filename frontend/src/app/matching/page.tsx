"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Check, ChevronRight, EyeOff, Send, SlidersHorizontal, Sparkles, Users, Wallet, X } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, Chip, Chips, EmptyState, Input, Loading, PageHeader, Stars } from "@/components/ui";
import { NOT_RELEVANT_LABELS, matchingApi } from "@/features/matching/api";
import FindMentorTabs from "@/features/matching/FindMentorTabs";
import DomainStep from "@/features/matching/DomainStep";
import IntentBar from "@/features/matching/IntentBar";
import FilterSheet from "@/features/matching/FilterSheet";
import PipelineRun, { PipelineStrip } from "@/features/matching/PipelineRun";
import ScoreBreakdown from "@/features/matching/ScoreBreakdown";
import MatchingFilters, { NO_FILTERS, biggestBlocker, describeFilter, dropFilter } from "@/features/matching/MatchingFilters";
import { mentoringApi } from "@/features/mentoring/api";
import { profileApi } from "@/features/profile/api";
import { CompletenessCard } from "@/features/profile/ProfileExtras";
import { domainLabel } from "@/features/profile/api";
import { formatMoney, formatRate } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { Completeness, MatchFilterName, MatchFilterValues, MatchIntentValue, NotRelevantReason, MatchResult, RankedMentor, SessionUser } from "@/types";

const LIMIT = 10;
/** Số mentor nổi bật hiện dạng thẻ; phần còn lại là danh sách gọn (Hick's Law). */
const TOP = 3;
const MAX_REASONS = 3;

const pct = (x: number) => Math.round(x * 100);

/** Lý do riêng của từng mentor: bỏ những lý do mọi mentor trong danh sách đều có (không giúp so sánh). */
function distinctReasons(mentors: RankedMentor[]): Map<string, string[]> {
  const freq = new Map<string, number>();
  mentors.forEach((m) => new Set(m.reasons).forEach((r) => freq.set(r, (freq.get(r) ?? 0) + 1)));
  return new Map(mentors.map((m) => {
    const own = mentors.length > 1 ? m.reasons.filter((r) => (freq.get(r) ?? 0) < mentors.length) : m.reasons;
    return [m.mentorId, (own.length ? own : m.reasons).slice(0, MAX_REASONS)];
  }));
}

/** Nhãn "điểm mạnh nhất" cho các thẻ nổi bật: mentor đầu là phù hợp nhất, các thẻ sau nhận nhãn còn trống. */
function highlightTags(mentors: RankedMentor[]): Map<string, string> {
  const tags = new Map<string, string>();
  if (!mentors.length) return tags;
  tags.set(mentors[0].mentorId, "Phù hợp nhất");
  const rated = mentors.filter((m) => m.ratingCount >= 3);
  const best = (list: RankedMentor[], value: (m: RankedMentor) => number, low = false) => {
    if (list.length < 2) return null;
    const vals = list.map(value);
    const target = low ? Math.min(...vals) : Math.max(...vals);
    if (vals.every((v) => v === target)) return null; // ai cũng bằng nhau → không phải điểm mạnh
    return list.find((m) => value(m) === target && !tags.has(m.mentorId)) ?? null;
  };
  const candidates: [string, RankedMentor | null][] = [
    ["Lịch khớp nhất", best(mentors.slice(0, TOP), (m) => m.scheduleFit)],
    ["Giá tốt nhất", best(mentors.slice(0, TOP), (m) => Number(m.hourlyRate), true)],
    ["Nhiều kinh nghiệm nhất", best(mentors.slice(0, TOP), (m) => m.yearsExperience)],
    ["Đánh giá cao nhất", best(rated.slice(0, TOP), (m) => m.rating)],
  ];
  for (const [label, m] of candidates) if (m && !tags.has(m.mentorId)) tags.set(m.mentorId, label);
  return tags;
}

/** US-36 — "Không phù hợp": chọn lý do, mentor bị ẩn 30 ngày. */
function NotRelevantForm({ onSubmit, onCancel }: { onSubmit: (r: NotRelevantReason, note: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState<NotRelevantReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="well flex flex-col gap-3">
      <div className="text-small font-medium">Vì sao mentor này không phù hợp?</div>
      <Chips>
        {(Object.keys(NOT_RELEVANT_LABELS) as NotRelevantReason[]).map((r) => (
          <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>{NOT_RELEVANT_LABELS[r]}</Chip>
        ))}
      </Chips>
      {reason === "OTHER" && <Input value={note} maxLength={300} aria-label="Lý do khác" placeholder="Lý do (không bắt buộc)" onChange={(e) => setNote(e.target.value)} />}
      <div className="form-actions">
        <Button size="sm" variant="danger" icon={EyeOff} disabled={!reason} loading={busy} onClick={async () => {
          if (!reason) return;
          setBusy(true);
          try {
            await onSubmit(reason, note.trim());
          } finally {
            setBusy(false);
          }
        }}>Ẩn mentor này 30 ngày</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Huỷ</Button>
      </div>
    </div>
  );
}

function responseText(m: RankedMentor) {
  if (m.medianResponseHours === null) return null;
  return m.medianResponseHours <= 24 ? "Phản hồi trong 24 giờ" : m.medianResponseHours <= 72 ? "Phản hồi trong 3 ngày" : "Phản hồi chậm";
}

interface MatchItemProps {
  m: RankedMentor;
  reasons: string[];
  requested: boolean;
  onNotRelevant: (reason: NotRelevantReason, note: string) => Promise<void>;
}

/** Chi tiết khi cần: phân rã điểm, đủ lý do và phản hồi "Không phù hợp". */
function MatchDetails({ m, onNotRelevant }: Pick<MatchItemProps, "m" | "onNotRelevant">) {
  const [hiding, setHiding] = useState(false);
  const response = responseText(m);
  return (
    <details className="disclosure">
      <summary><ChevronRight aria-hidden="true" />Vì sao {pct(m.finalScore)}% phù hợp?</summary>
      <div className="mt-3 flex flex-col gap-4">
        <ScoreBreakdown m={m} />
        <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-ink-muted">
          {m.reasons.map((r) => <li key={r}>{r}</li>)}
          {response && <li>{response}</li>}
        </ul>
        {hiding
          ? <NotRelevantForm onCancel={() => setHiding(false)} onSubmit={onNotRelevant} />
          : <Button size="sm" variant="ghost" className="self-start" icon={EyeOff} onClick={() => setHiding(true)}>Không phù hợp với tôi</Button>}
      </div>
    </details>
  );
}

function MentorMeta({ m }: { m: RankedMentor }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
      <span>{m.yearsExperience} năm kinh nghiệm</span>
      <span className="font-medium text-ink tabular">{formatRate(m.hourlyRate)}</span>
      {m.overBudget && m.overBudgetBy != null && (
        <Badge tone="warning" title="Giá cao hơn ngân sách bạn đặt">Vượt ngân sách +{formatMoney(m.overBudgetBy)}/giờ</Badge>
      )}
      {/* US-41 (PRD-REV-5) — sao chỉ hiện khi ≥ 3 đánh giá */}
      {m.ratingCount >= 3 ? <Stars value={m.rating} count={m.ratingCount} /> : <span>Mentor mới</span>}
    </div>
  );
}

function RequestButton({ m, requested, primary }: { m: RankedMentor; requested: boolean; primary?: boolean }) {
  if (requested) return <Badge tone="success">Đã gửi yêu cầu</Badge>;
  return <ButtonLink href={`/mentoring/request/${m.mentorId}`} variant={primary ? "primary" : "secondary"} icon={Send}>Gửi yêu cầu</ButtonLink>;
}

/** Thẻ nổi bật (top 3): điểm, nhãn điểm mạnh, 2–3 lý do riêng, kỹ năng trùng. */
function TopMatchCard({ m, reasons, requested, onNotRelevant, tag, best }: MatchItemProps & { tag?: string; best: boolean }) {
  const matched = m.matchedSkills.slice(0, 4);
  return (
    <Card as="article" className={best ? "match-card match-card-best" : "match-card"}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tag ? <Badge tone={best ? "accent" : "neutral"}>{tag}</Badge> : <span />}
          {m.transitionFit && <Badge tone="success" title="Từng chuyển đúng từ lĩnh vực của bạn">Từng chuyển ngách</Badge>}
        </div>
        <div className="match-score" aria-label={`Phù hợp ${pct(m.finalScore)}%`}>
          <strong>{pct(m.finalScore)}%</strong><span>phù hợp</span>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Avatar name={m.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <Link href={`/mentors/${m.mentorId}`} className="text-title-3 font-semibold text-ink">{m.displayName}</Link>
          {m.headline && <div className="line-clamp-2 text-small text-ink-muted">{m.headline}</div>}
          <div className="mt-1"><MentorMeta m={m} /></div>
        </div>
      </div>
      {reasons.length > 0 && (
        <p className="match-why"><b>Vì sao phù hợp:</b> {reasons.join(". ")}.</p>
      )}
      <ul className="reasons">
        {reasons.map((r) => <li key={r}><Check aria-hidden="true" />{r}</li>)}
      </ul>
      {matched.length > 0 && (
        <Chips>
          {matched.map((s) => <Chip key={s} match>{s}</Chip>)}
        </Chips>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <RequestButton m={m} requested={requested} primary={best} />
        <ButtonLink href={`/mentors/${m.mentorId}`} variant="ghost">Xem hồ sơ</ButtonLink>
      </div>
      <MatchDetails m={m} onNotRelevant={onNotRelevant} />
    </Card>
  );
}

/** Các mentor còn lại: một dòng gọn, chi tiết mở khi cần. */
function MatchRow({ m, reasons, requested, onNotRelevant }: MatchItemProps) {
  return (
    <div className="match-row">
      <Avatar name={m.displayName} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link href={`/mentors/${m.mentorId}`} className="font-semibold text-ink">{m.displayName}</Link>
          <span className="text-small font-semibold text-accent-ink tabular">{pct(m.finalScore)}% phù hợp</span>
          {m.transitionFit && <Badge tone="success">Từng chuyển ngách</Badge>}
        </div>
        <MentorMeta m={m} />
        {reasons[0] && <div className="text-small text-ink-muted">{reasons[0]}</div>}
        <MatchDetails m={m} onNotRelevant={onNotRelevant} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href={`/mentors/${m.mentorId}`} size="sm" variant="ghost">Xem hồ sơ</ButtonLink>
        {requested
          ? <Badge tone="success">Đã gửi yêu cầu</Badge>
          : <ButtonLink href={`/mentoring/request/${m.mentorId}`} size="sm" icon={Send}>Gửi yêu cầu</ButtonLink>}
      </div>
    </div>
  );
}

/** Thẻ lưới cho "Lựa chọn khác": điểm, kỹ năng, một lý do; chi tiết điểm và "Không phù hợp" mở khi cần. */
function MatchGridCard({ m, reasons, requested, onNotRelevant }: MatchItemProps) {
  return (
    <Card as="article" className="match-gcard">
      <div className="flex items-start gap-3">
        <Avatar name={m.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <Link href={`/mentors/${m.mentorId}`} className="font-semibold text-ink">{m.displayName}</Link>
          {m.headline && <div className="line-clamp-2 text-small text-ink-muted">{m.headline}</div>}
        </div>
        <span className="match-score" aria-label={`Phù hợp ${pct(m.finalScore)}%`}><strong>{pct(m.finalScore)}</strong></span>
      </div>
      <MentorMeta m={m} />
      {m.matchedSkills.length > 0 && <Chips>{m.matchedSkills.slice(0, 3).map((s) => <Chip key={s} match>{s}</Chip>)}</Chips>}
      {reasons[0] && <p className="text-small text-ink-muted">{reasons[0]}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {requested
          ? <Badge tone="success">Đã gửi yêu cầu</Badge>
          : <ButtonLink href={`/mentoring/request/${m.mentorId}`} size="sm" icon={Send}>Gửi yêu cầu</ButtonLink>}
        <ButtonLink href={`/mentors/${m.mentorId}`} size="sm" variant="ghost">Hồ sơ</ButtonLink>
      </div>
      <MatchDetails m={m} onNotRelevant={onNotRelevant} />
    </Card>
  );
}

/** Bộ lọc đang bật: [tên, mô tả ngắn], ví dụ ["maxRate", "ngân sách ≤ 150.000đ"]. */
function activeFilters(f: MatchFilterValues): [MatchFilterName, string][] {
  return (Object.keys(NO_FILTERS) as MatchFilterName[])
    .filter((k) => JSON.stringify(f[k]) !== JSON.stringify(NO_FILTERS[k]))
    .map((k) => [k, describeFilter(k, f)]);
}

/** Thẻ gọn cho mentor phù hợp nhưng vượt ngân sách. */
function OverBudgetCard({ m, requested }: { m: RankedMentor; requested: boolean }) {
  return (
    <article className="match-over-card">
      <Avatar name={m.displayName} size="lg" />
      <div className="min-w-0 flex-1" style={{ flexBasis: 160 }}>
        <Link href={`/mentors/${m.mentorId}`} className="font-semibold text-ink">{m.displayName}</Link>
        {m.headline && <div className="line-clamp-2 text-small text-ink-muted">{m.headline}</div>}
        {m.overBudgetBy != null && <span className="mt-1.5 inline-block"><Badge tone="warning">Vượt ngân sách +{formatMoney(m.overBudgetBy)}/giờ</Badge></span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={`/mentors/${m.mentorId}`} size="sm" variant="secondary">Xem hồ sơ</ButtonLink>
        {requested && <Badge tone="success">Đã gửi yêu cầu</Badge>}
      </div>
    </article>
  );
}

function SectionTitle({ id, icon: Icon, tone, large, children }: { id: string; icon: typeof Sparkles; tone?: "warning"; large?: boolean; children: ReactNode }) {
  return (
    <h2 id={id} className={large ? "find-h find-h-lg" : "find-h"}>
      <span className="find-h-ico" data-tone={tone} aria-hidden="true"><Icon /></span>{children}
    </h2>
  );
}

function Matching({ user }: { user: SessionUser }) {
  const [data, setData] = useState<MatchResult | null | undefined>(undefined);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** Đang trình bày pipeline; `pending` = kết quả đã về nhưng chờ các bước hiện xong mới hiện danh sách. */
  const [playing, setPlaying] = useState(false);
  /** Mục đích tìm (chuyển ngách...) áp cho mọi lượt tìm tiếp theo, kể cả khi đổi bộ lọc. */
  const [intent, setIntent] = useState<MatchIntentValue>({ mode: "CURRENT" });
  const [menteeDomain, setMenteeDomain] = useState<string | null>(null);
  /** Các lĩnh vực trong hồ sơ (chính trước, rồi các lĩnh vực phụ) và lĩnh vực đang tìm; null = chưa chọn (chưa tìm). */
  const [domains, setDomains] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  /** Lĩnh vực nhắc tới trong ô nhập nhưng chưa có trong hồ sơ. */
  const [otherDomain, setOtherDomain] = useState<string | null>(null);
  const intentRef = useRef<MatchIntentValue>({ mode: "CURRENT" });
  const [pending, setPending] = useState<MatchResult | undefined>(undefined);
  /** US-37 — hồ sơ hoàn thiện < 50% thì chưa cho dùng AI Matching. */
  const [gate, setGate] = useState<Completeness | null>(null);
  const [hiddenMsg, setHiddenMsg] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const lastFilters = useRef<MatchFilterValues | undefined>(undefined);

  /** filters undefined = để server lấy sở thích hồ sơ làm bộ lọc (US-17); có giá trị = ghi đè cho lượt này. */
  const search = useCallback((filters?: MatchFilterValues, nextIntent?: MatchIntentValue) => {
    lastFilters.current = filters;
    if (nextIntent) {
      intentRef.current = nextIntent;
      setIntent(nextIntent);
    }
    setBusy(true);
    setError(null);
    setPending(undefined);
    setPlaying(true);
    matchingApi.mentorsFor(user.userId, { limit: LIMIT, filters, intent: intentRef.current })
      .then(setPending)
      .catch((e: unknown) => {
        setError({ code: e instanceof ApiError ? e.code : "UNKNOWN", message: errorMessage(e) });
        setData(null);
        setPlaying(false);
      })
      .finally(() => setBusy(false));
  }, [user]);

  useEffect(() => {
    profileApi.getMentee(user.userId)
      .then((p) => {
        const mine = [p.domain, ...(p.extraDomains ?? []).map((d) => d.domain)];
        setMenteeDomain(p.domain);
        setDomains(mine);
        if (p.matchingEnabled) {
          if (mine.length > 1) setData(null); // nhiều lĩnh vực: mentee chọn lĩnh vực trước, chưa tìm ngay
          else {
            setChosen(p.domain);
            search();
          }
        } else {
          setGate(p.completeness);
          setData(null);
        }
      })
      .catch(() => search()); // chưa có hồ sơ → matching-service trả MENTEE_PROFILE_INCOMPLETE
    mentoringApi.requests().then((rs) => setRequested(new Set(rs.filter((r) => ["PENDING", "ACCEPTED"].includes(r.status)).map((r) => r.mentorId)))).catch(() => {});
  }, [user, search]);

  useEffect(() => {
    if (!data) return;
    try {
      data.mentors.forEach((m) => sessionStorage.setItem(`match:${m.mentorId}`, JSON.stringify({
        finalScore: m.finalScore, scoreParts: m.scoreParts, reasons: m.reasons, newMentor: m.newMentor,
        transitionFit: m.transitionFit, intent: data.intent,
      })));
    } catch { /* sessionStorage có thể bị chặn — chỉ mất phần giải thích trên trang mentor */ }
  }, [data]);

  const chooseDomain = (domain: string) => {
    setChosen(domain);
    setOtherDomain(null);
    search(lastFilters.current, domain === menteeDomain ? { mode: "CURRENT" } : { mode: "SWITCH", targetDomain: domain });
  };

  const finishPlaying = useCallback((result: MatchResult) => {
    setData(result);
    setPlaying(false);
  }, []);
  const replay = () => {
    setPending(data ?? undefined);
    setPlaying(true);
  };

  if (gate) {
    return (
      <>
        <PageHeader title="Tìm mentor" description="Gợi ý của AI cần hồ sơ hoàn thiện tối thiểu 50% để chính xác." />
        <FindMentorTabs current="matching" />
        <div className="flex max-w-[640px] flex-col gap-6">
          <Alert tone="warning" action={<ButtonLink href="/profile" size="sm" variant="primary">Bổ sung hồ sơ</ButtonLink>}>
            Hồ sơ của bạn mới hoàn thiện {gate.score}%. Bổ sung thêm, hoặc chọn tab <Link href="/mentors">Tất cả mentor</Link> để tự duyệt.
          </Alert>
          <CompletenessCard completeness={gate} matchingMin={50} />
        </div>
      </>
    );
  }
  const header = (
    <>
      <PageHeader
        title="Tìm mentor"
        description="AI xếp hạng mentor đã xác thực theo hồ sơ, mục tiêu và lịch rảnh của bạn."
        actions={<ButtonLink href="/profile" variant="ghost">Cập nhật hồ sơ</ButtonLink>}
      />
      <FindMentorTabs current="matching" />
    </>
  );
  if (playing) {
    return <>{header}<PipelineRun mode="live" result={pending} onDone={finishPlaying} /></>;
  }
  if (data === undefined) return <>{header}<Loading text="AI đang tìm mentor phù hợp…" /></>;
  // US-18 — kết quả ít hơn LIMIT: chỉ ra bộ lọc loại nhiều mentor nhất và cho nới bằng một cú nhấp.
  // Mentor trong ngân sách đứng đầu; mentor phù hợp nhưng vượt ngân sách xếp riêng ở cuối (không bị loại).
  const fit = (data?.mentors ?? []).filter((m) => !m.overBudget);
  const over = (data?.mentors ?? []).filter((m) => m.overBudget);
  const blocker = data && fit.length < LIMIT ? biggestBlocker(data.excludedBy) : null;
  const reasons = distinctReasons(data?.mentors ?? []);
  const tags = highlightTags(fit);
  const filtersOn = data ? activeFilters(data.filters) : [];
  const closeFilters = () => setShowFilters(false);

  const notRelevant = (m: RankedMentor) => async (reason: NotRelevantReason, note: string) => {
    if (!data) return;
    try {
      await matchingApi.notRelevant(user.userId, m.mentorId, reason, note, data.impressionId);
      setHiddenMsg(`Đã ẩn ${m.displayName} trong 30 ngày.`);
      search(lastFilters.current);
    } catch (e) {
      setError({ code: e instanceof ApiError ? e.code : "UNKNOWN", message: errorMessage(e) });
    }
  };

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        {error?.code === "MENTEE_PROFILE_INCOMPLETE" && (
          <Alert tone="warning" action={<ButtonLink href="/profile" size="sm">Tạo hồ sơ</ButtonLink>}>{error.message}.</Alert>
        )}
        {error && error.code !== "MENTEE_PROFILE_INCOMPLETE" && <Alert>{error.message}</Alert>}
        {domains.length > 1 && <DomainStep domains={domains} primary={menteeDomain} value={chosen} busy={busy} onChange={chooseDomain} />}
        {otherDomain && (
          <Alert tone="info" action={<ButtonLink href="/profile#ld" size="sm">Thêm vào hồ sơ</ButtonLink>}>
            <b>{domainLabel(otherDomain)}</b> chưa có trong hồ sơ của bạn. Thêm lĩnh vực này (kèm kỹ năng và mục tiêu riêng) để tìm mentor cho nó.
          </Alert>
        )}
        {chosen !== null && (
          <IntentBar key={chosen} value={intent} domains={domains} busy={busy} onOtherDomain={setOtherDomain}
            onChange={(next) => { setOtherDomain(null); search(lastFilters.current, next); }} />
        )}
        {data?.intent.mode === "SWITCH" && data.intent.targetDomain && (
          <Alert tone="info">
            Đang tìm mentor <b>{domainLabel(data.intent.targetDomain)}</b> bằng kỹ năng và mục tiêu riêng của lĩnh vực này
            {menteeDomain ? <>. Mentor từng chuyển từ {domainLabel(menteeDomain)} sang đây được ưu tiên</> : null}.
          </Alert>
        )}
        {data && (
          <>
            <PipelineStrip result={data} />
            <div className="flex flex-col gap-3">
              <div className="find-filterbar">
                <Button icon={SlidersHorizontal} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
                  Bộ lọc{filtersOn.length > 0 && ` · ${filtersOn.length}`}
                </Button>
                {filtersOn.map(([name, label]) => (
                  <button key={name} type="button" className="find-fchip" disabled={busy} aria-label={`Bỏ bộ lọc ${label}`}
                    onClick={() => search(dropFilter(data.filters, name))}>
                    {label}<X aria-hidden="true" />
                  </button>
                ))}
                {filtersOn.length === 0 && <span className="text-small text-ink-muted">Chưa lọc, hiện mọi mentor phù hợp.</span>}
                {data.filters.fromProfileDefaults.length > 0 && <span className="text-small text-ink-muted">Một số bộ lọc lấy từ sở thích trong hồ sơ.</span>}
                {filtersOn.length > 0 && <button type="button" className="find-clear" disabled={busy} onClick={() => search(NO_FILTERS)}>Xoá bộ lọc</button>}
              </div>
              {showFilters && (
                <FilterSheet open onClose={closeFilters} onClear={() => { closeFilters(); search(NO_FILTERS); }}>
                  <MatchingFilters value={data.filters} fromProfile={data.filters.fromProfileDefaults} busy={busy}
                    onSearch={(f) => { closeFilters(); search(f); }} onUseProfile={() => { closeFilters(); search(); }} />
                </FilterSheet>
              )}
            </div>
            {hiddenMsg && <Alert tone="success">{hiddenMsg}</Alert>}
            {blocker && (
              <Alert tone="warning" action={<Button size="sm" disabled={busy} onClick={() => search(dropFilter(data.filters, blocker[0]))}>Nới điều kiện</Button>}>
                Chỉ tìm thấy {fit.length} mentor: {blocker[1]} mentor bị loại bởi {describeFilter(blocker[0], data.filters)}.
              </Alert>
            )}
            {data.mentors.length === 0 ? (
              <Card>
                <EmptyState icon={Sparkles} title="Chưa tìm thấy mentor phù hợp" action={<ButtonLink href="/mentors" size="sm">Xem tất cả mentor</ButtonLink>}>
                  Thử nới bộ lọc, hoặc bổ sung kỹ năng và mục tiêu trong hồ sơ.
                </EmptyState>
              </Card>
            ) : (
              <>
                {fit.length === 0 && (
                  <Alert tone="warning">
                    Chưa có mentor nào trong ngân sách {data.filters.maxRate !== null ? `${formatMoney(data.filters.maxRate)}/giờ` : "của bạn"}.
                    Dưới đây là các mentor phù hợp nhưng giá cao hơn.
                  </Alert>
                )}
                {fit.length > 0 && (
                  <section className="flex flex-col gap-3" aria-labelledby="top-title">
                    <SectionTitle id="top-title" icon={Sparkles} large>
                      {fit.length === 1 ? "Phù hợp nhất với bạn" : `${Math.min(TOP, fit.length)} mentor phù hợp nhất với bạn`}
                    </SectionTitle>
                    <div className="match-top">
                      {fit.slice(0, TOP).map((m, i) => (
                        <TopMatchCard key={m.mentorId} m={m} best={i === 0} tag={tags.get(m.mentorId)}
                          reasons={reasons.get(m.mentorId) ?? []} requested={requested.has(m.mentorId)} onNotRelevant={notRelevant(m)} />
                      ))}
                    </div>
                  </section>
                )}
                {fit.length > TOP && (
                  <section className="flex flex-col gap-3" aria-labelledby="more-title">
                    <SectionTitle id="more-title" icon={Users}>Lựa chọn khác</SectionTitle>
                    <div className="match-grid">
                      {fit.slice(TOP).map((m) => (
                        <MatchGridCard key={m.mentorId} m={m} reasons={reasons.get(m.mentorId) ?? []}
                          requested={requested.has(m.mentorId)} onNotRelevant={notRelevant(m)} />
                      ))}
                    </div>
                  </section>
                )}
                {over.length > 0 && (
                  <section className="flex flex-col gap-3" aria-labelledby="over-title">
                    <SectionTitle id="over-title" icon={Wallet} tone="warning">Phù hợp nhưng vượt ngân sách</SectionTitle>
                    <p className="text-small text-ink-muted">
                      Các mentor này khớp với hồ sơ của bạn nhưng giá cao hơn mức {data.filters.maxRate !== null ? `${formatMoney(data.filters.maxRate)}/giờ ` : ""}
                      bạn đặt. Họ đứng cuối để bạn vẫn thấy được lựa chọn.
                      {data.pipeline.overBudget > over.length && ` Còn ${data.pipeline.overBudget - over.length} mentor khác cũng vượt ngân sách.`}
                    </p>
                    <div className="match-over">
                      {over.map((m) => <OverBudgetCard key={m.mentorId} m={m} requested={requested.has(m.mentorId)} />)}
                    </div>
                  </section>
                )}
              </>
            )}
            <p className="find-note">
              Chưa thấy ai ưng ý? <Link href="/mentors" className="font-semibold">Xem tất cả mentor &rarr;</Link>
            </p>
            <div className="flex flex-col gap-2 text-small text-ink-muted">
              {data.pipeline.hidden > 0 && (
                <p>Đang ẩn {data.pipeline.hidden} mentor bạn đánh dấu không phù hợp. <Link href="/matching/hidden">Xem hoặc bỏ ẩn</Link>.</p>
              )}
              <details className="disclosure">
                <summary><ChevronRight aria-hidden="true" />Cách AI chọn {data.mentors.length} mentor này từ {data.pipeline.considered} mentor</summary>
                <div className="mt-2"><PipelineRun mode="static" result={data} onReplay={replay} /></div>
              </details>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function MatchingPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Matching user={user} />}</RequireAuth>;
}
