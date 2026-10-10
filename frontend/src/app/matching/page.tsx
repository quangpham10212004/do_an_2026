"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Check, ChevronRight, EyeOff, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, Chip, Chips, EmptyState, Input, Loading, PageHeader, Stars } from "@/components/ui";
import { EXCLUSION_LABELS, NOT_RELEVANT_LABELS, matchingApi } from "@/features/matching/api";
import FindMentorTabs from "@/features/matching/FindMentorTabs";
import MatchingFilters, { NO_FILTERS, biggestBlocker, describeFilter, dropFilter } from "@/features/matching/MatchingFilters";
import { mentoringApi } from "@/features/mentoring/api";
import { profileApi } from "@/features/profile/api";
import { CompletenessCard } from "@/features/profile/ProfileExtras";
import { formatRate } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { Completeness, ExclusionReason, MatchFilterName, MatchFilterValues, NotRelevantReason, MatchResult, PipelineWeights, RankedMentor, SessionUser } from "@/types";

const LIMIT = 10;
/** Số mentor nổi bật hiện dạng thẻ; phần còn lại là danh sách gọn (Hick's Law). */
const TOP = 3;
const MAX_REASONS = 3;

const pct = (x: number) => Math.round(x * 100);

const PART_META: { key: keyof PipelineWeights; label: string }[] = [
  { key: "similarity", label: "Tương đồng hồ sơ" },
  { key: "rating", label: "Đánh giá" },
  { key: "experience", label: "Kinh nghiệm" },
  { key: "scheduleFit", label: "Khớp lịch" },
  { key: "responsiveness", label: "Phản hồi nhanh" },
];

/** US-35 — các phần điểm do matching-service trả về (scoreParts), cộng lại đúng bằng finalScore. */
function scoreParts(m: RankedMentor) {
  return PART_META.map((p) => ({
    ...p,
    label: p.key === "rating" && m.newMentor ? "Đánh giá (trung vị nền tảng)" : p.label,
    value: m.scoreParts?.[p.key] ?? 0,
  }));
}

function ScoreBreakdown({ m }: { m: RankedMentor }) {
  const parts = scoreParts(m);
  const summary = parts.map((p) => `${p.label} ${pct(p.value)}`).join(", ");
  return (
    <div className="flex flex-col gap-2">
      <div className="meter" role="img" aria-label={`Điểm phù hợp ${pct(m.finalScore)}%: ${summary}`}>
        {parts.map((p) => <span key={p.key} style={{ width: `${p.value * 100}%` }} />)}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.key}><i />{p.label} <span className="tabular">+{pct(p.value)}</span></span>
        ))}
      </div>
    </div>
  );
}

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
        {tag ? <Badge tone={best ? "accent" : "neutral"}>{tag}</Badge> : <span />}
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

/** Tóm tắt bộ lọc đang bật, ví dụ "giá ≤ 150.000đ · buổi tối". */
function activeFilters(f: MatchFilterValues): string[] {
  return (Object.keys(NO_FILTERS) as MatchFilterName[])
    .filter((k) => JSON.stringify(f[k]) !== JSON.stringify(NO_FILTERS[k]))
    .map((k) => describeFilter(k, f));
}

function Matching({ user }: { user: SessionUser }) {
  const [data, setData] = useState<MatchResult | null | undefined>(undefined);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** US-37 — hồ sơ hoàn thiện < 50% thì chưa cho dùng AI Matching. */
  const [gate, setGate] = useState<Completeness | null>(null);
  const [hiddenMsg, setHiddenMsg] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const lastFilters = useRef<MatchFilterValues | undefined>(undefined);

  /** filters undefined = để server lấy sở thích hồ sơ làm bộ lọc (US-17); có giá trị = ghi đè cho lượt này. */
  const search = useCallback((filters?: MatchFilterValues) => {
    lastFilters.current = filters;
    setBusy(true);
    setError(null);
    matchingApi.mentorsFor(user.userId, { limit: LIMIT, filters })
      .then(setData)
      .catch((e: unknown) => {
        setError({ code: e instanceof ApiError ? e.code : "UNKNOWN", message: errorMessage(e) });
        setData(null);
      })
      .finally(() => setBusy(false));
  }, [user]);

  useEffect(() => {
    profileApi.getMentee(user.userId)
      .then((p) => {
        if (p.matchingEnabled) search();
        else {
          setGate(p.completeness);
          setData(null);
        }
      })
      .catch(() => search()); // chưa có hồ sơ → matching-service trả MENTEE_PROFILE_INCOMPLETE
    mentoringApi.requests().then((rs) => setRequested(new Set(rs.filter((r) => ["PENDING", "ACCEPTED"].includes(r.status)).map((r) => r.mentorId)))).catch(() => {});
  }, [user, search]);

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
  if (data === undefined) return <>{header}<Loading text="AI đang tìm mentor phù hợp…" /></>;
  const excluded = data?.pipeline?.excluded || {};
  const excludedEntries = Object.entries(excluded) as [ExclusionReason, number][];
  const excludedTotal = excludedEntries.reduce((sum, [, n]) => sum + n, 0);
  // US-18 — kết quả ít hơn LIMIT: chỉ ra bộ lọc loại nhiều mentor nhất và cho nới bằng một cú nhấp.
  const blocker = data && data.mentors.length < LIMIT ? biggestBlocker(data.excludedBy) : null;
  const reasons = distinctReasons(data?.mentors ?? []);
  const tags = highlightTags(data?.mentors ?? []);
  const filtersOn = data ? activeFilters(data.filters) : [];

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
        {data && (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button icon={SlidersHorizontal} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
                  Bộ lọc{filtersOn.length > 0 && ` (${filtersOn.length})`}
                </Button>
                <span className="text-small text-ink-muted">
                  {filtersOn.length ? `Đang lọc: ${filtersOn.join(" · ")}` : "Chưa lọc — hiện mọi mentor phù hợp."}
                  {data.filters.fromProfileDefaults.length > 0 && " Một số bộ lọc lấy từ sở thích trong hồ sơ."}
                </span>
              </div>
              {showFilters && (
                <MatchingFilters value={data.filters} fromProfile={data.filters.fromProfileDefaults} busy={busy}
                  onSearch={(f) => search(f)} onUseProfile={() => search()} />
              )}
            </div>
            {hiddenMsg && <Alert tone="success">{hiddenMsg}</Alert>}
            {blocker && (
              <Alert tone="warning" action={<Button size="sm" disabled={busy} onClick={() => search(dropFilter(data.filters, blocker[0]))}>Nới điều kiện</Button>}>
                Chỉ tìm thấy {data.mentors.length} mentor: {blocker[1]} mentor bị loại bởi {describeFilter(blocker[0], data.filters)}.
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
                <section className="flex flex-col gap-3" aria-labelledby="top-title">
                  <h2 id="top-title" className="text-title-2 font-semibold">
                    {Math.min(TOP, data.mentors.length)} mentor phù hợp nhất với bạn
                  </h2>
                  <div className="match-top">
                    {data.mentors.slice(0, TOP).map((m, i) => (
                      <TopMatchCard key={m.mentorId} m={m} best={i === 0} tag={tags.get(m.mentorId)}
                        reasons={reasons.get(m.mentorId) ?? []} requested={requested.has(m.mentorId)} onNotRelevant={notRelevant(m)} />
                    ))}
                  </div>
                </section>
                {data.mentors.length > TOP && (
                  <section className="flex flex-col gap-3" aria-labelledby="more-title">
                    <h2 id="more-title" className="text-title-3 font-semibold">Lựa chọn khác</h2>
                    <Card>
                      {data.mentors.slice(TOP).map((m) => (
                        <MatchRow key={m.mentorId} m={m} reasons={reasons.get(m.mentorId) ?? []}
                          requested={requested.has(m.mentorId)} onNotRelevant={notRelevant(m)} />
                      ))}
                    </Card>
                  </section>
                )}
              </>
            )}
            <div className="flex flex-col gap-2 text-small text-ink-muted">
              {data.pipeline.hidden > 0 && (
                <p>Đang ẩn {data.pipeline.hidden} mentor bạn đánh dấu không phù hợp. <Link href="/matching/hidden">Xem hoặc bỏ ẩn</Link>.</p>
              )}
              <details className="disclosure">
                <summary><ChevronRight aria-hidden="true" />Cách AI chọn {data.mentors.length} mentor này từ {data.pipeline.considered} mentor</summary>
                <p className="mt-2 max-w-[90ch]">
                  Xét {data.pipeline.considered} mentor, loại {excludedTotal} không đủ điều kiện
                  {excludedTotal > 0 && ` (${excludedEntries.map(([k, v]) => `${v} ${EXCLUSION_LABELS[k] || k}`).join(", ")})`}, còn {data.pipeline.eligible} mentor
                  thoả bộ lọc. Lấy {data.pipeline.retrieved} mentor gần nhất về nội dung (top-K = {data.pipeline.k}), rồi xếp hạng lại với
                  trọng số tương đồng {data.pipeline.weights.similarity}, đánh giá {data.pipeline.weights.rating}, kinh nghiệm {data.pipeline.weights.experience},
                  khớp lịch {data.pipeline.weights.scheduleFit}, phản hồi nhanh {data.pipeline.weights.responsiveness}.
                </p>
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
