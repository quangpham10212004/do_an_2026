"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Check, EyeOff, Send, Sparkles } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, CardBody, Chip, Chips, EmptyState, Input, Loading, PageHeader, ScoreRing, Stars } from "@/components/ui";
import { EXCLUSION_LABELS, NOT_RELEVANT_LABELS, matchingApi } from "@/features/matching/api";
import MatchingFilters, { biggestBlocker, describeFilter, dropFilter } from "@/features/matching/MatchingFilters";
import { mentoringApi } from "@/features/mentoring/api";
import { profileApi } from "@/features/profile/api";
import { CompletenessCard } from "@/features/profile/ProfileExtras";
import { formatRate } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/api";
import type { Completeness, ExclusionReason, MatchFilterValues, NotRelevantReason, MatchResult, PipelineWeights, RankedMentor, SessionUser } from "@/types";

const LIMIT = 10;

const pct = (x: number) => Math.round(x * 100);

const PART_META: { key: keyof PipelineWeights; label: string; color: string }[] = [
  { key: "similarity", label: "Tương đồng hồ sơ", color: "var(--accent)" },
  { key: "rating", label: "Đánh giá", color: "var(--amber)" },
  { key: "experience", label: "Kinh nghiệm", color: "var(--info)" },
  { key: "scheduleFit", label: "Khớp lịch", color: "var(--ink-muted)" },
  { key: "responsiveness", label: "Phản hồi nhanh", color: "var(--border-strong)" },
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
        {parts.map((p) => <span key={p.key} style={{ width: `${p.value * 100}%`, background: p.color }} />)}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.key}><i style={{ background: p.color }} />{p.label} <span className="tabular">+{pct(p.value)}</span></span>
        ))}
      </div>
    </div>
  );
}

interface MentorMatchCardProps {
  m: RankedMentor;
  requested: boolean;
  onNotRelevant: (reason: NotRelevantReason, note: string) => Promise<void>;
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

function MentorMatchCard({ m, requested, onNotRelevant }: MentorMatchCardProps) {
  const [hiding, setHiding] = useState(false);
  const response = m.medianResponseHours === null ? null
    : m.medianResponseHours <= 24 ? "Phản hồi trong 24 giờ" : m.medianResponseHours <= 72 ? "Phản hồi trong 3 ngày" : "Phản hồi chậm";
  return (
    <Card as="article">
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <Avatar name={m.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <Link href={`/mentors/${m.mentorId}`} className="text-title-3 font-semibold text-ink">{m.displayName}</Link>
            {m.headline && <div className="text-ink-muted">{m.headline}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
              <span>{m.domain}</span>
              <span>{m.yearsExperience} năm kinh nghiệm</span>
              <span className="font-medium text-ink tabular">{formatRate(m.hourlyRate)}</span>
              {/* US-41 (PRD-REV-5) — sao chỉ hiện khi ≥ 3 đánh giá */}
              {m.ratingCount >= 3 && <Stars value={m.rating} count={m.ratingCount} />}
              {m.newMentor && <Badge tone="accent">Mentor mới</Badge>}
              <span>Khớp lịch {pct(m.scheduleFit)}%</span>
              {response && <span>{response}</span>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing value={pct(m.finalScore)} size="lg" label={`Phù hợp ${pct(m.finalScore)}%`} />
            <span className="eyebrow">phù hợp</span>
          </div>
        </div>
        <ScoreBreakdown m={m} />
        <Chips>
          {m.skills.map((s) => <Chip key={s} match={m.matchedSkills.includes(s)}>{m.matchedSkills.includes(s) && <Check aria-hidden="true" />}{s}</Chip>)}
        </Chips>
        <div className="well">
          <div className="eyebrow mb-1.5">Vì sao gợi ý mentor này</div>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {m.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
        {hiding && <NotRelevantForm onCancel={() => setHiding(false)} onSubmit={onNotRelevant} />}
      </CardBody>
      <div className="card-foot">
        {!hiding && <Button variant="ghost" className="mr-auto" icon={EyeOff} onClick={() => setHiding(true)}>Không phù hợp</Button>}
        <ButtonLink href={`/mentors/${m.mentorId}`}>Xem hồ sơ</ButtonLink>
        {requested ? (
          <Badge tone="success">Đã gửi yêu cầu</Badge>
        ) : (
          <ButtonLink href={`/mentoring/request/${m.mentorId}`} variant="primary" icon={Send}>Gửi yêu cầu</ButtonLink>
        )}
      </div>
    </Card>
  );
}

function Matching({ user }: { user: SessionUser }) {
  const [data, setData] = useState<MatchResult | null | undefined>(undefined);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** US-37 — hồ sơ hoàn thiện < 50% thì chưa cho dùng AI Matching. */
  const [gate, setGate] = useState<Completeness | null>(null);
  const [hiddenMsg, setHiddenMsg] = useState("");
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
        <PageHeader title="AI Matching" description="AI Matching cần hồ sơ hoàn thiện tối thiểu 50% để gợi ý chính xác." />
        <div className="flex max-w-[640px] flex-col gap-6">
          <Alert tone="warning" action={<ButtonLink href="/profile" size="sm">Bổ sung hồ sơ</ButtonLink>}>
            Hồ sơ của bạn mới hoàn thiện {gate.score}%. Bổ sung hồ sơ, hoặc <Link href="/mentors">duyệt danh sách mentor</Link>.
          </Alert>
          <CompletenessCard completeness={gate} matchingMin={50} />
        </div>
      </>
    );
  }
  if (data === undefined) return <Loading text="AI đang tìm mentor phù hợp…" />;
  const excluded = data?.pipeline?.excluded || {};
  const excludedEntries = Object.entries(excluded) as [ExclusionReason, number][];
  const excludedTotal = excludedEntries.reduce((sum, [, n]) => sum + n, 0);
  // US-18 — kết quả ít hơn LIMIT: chỉ ra bộ lọc loại nhiều mentor nhất và cho nới bằng một cú nhấp.
  const blocker = data && data.mentors.length < LIMIT ? biggestBlocker(data.excludedBy) : null;

  return (
    <>
      <PageHeader
        title="AI Matching"
        description="Mentor đã xác thực, còn lịch rảnh và còn chỗ, xếp hạng theo độ tương đồng hồ sơ, đánh giá và kinh nghiệm."
        actions={<>
          <ButtonLink href="/profile">Cập nhật hồ sơ</ButtonLink>
          <ButtonLink href="/mentors">Xem tất cả mentor</ButtonLink>
        </>}
      />
      <div className="flex flex-col gap-6">
        {error?.code === "MENTEE_PROFILE_INCOMPLETE" && (
          <Alert tone="warning" action={<ButtonLink href="/profile" size="sm">Tạo hồ sơ</ButtonLink>}>{error.message}.</Alert>
        )}
        {error && error.code !== "MENTEE_PROFILE_INCOMPLETE" && <Alert>{error.message}</Alert>}
        {data && (
          <>
            <MatchingFilters value={data.filters} fromProfile={data.filters.fromProfileDefaults} busy={busy}
              onSearch={(f) => search(f)} onUseProfile={() => search()} />
            {hiddenMsg && <Alert tone="success">{hiddenMsg}</Alert>}
            {blocker && (
              <Alert tone="warning" action={<Button size="sm" disabled={busy} onClick={() => search(dropFilter(data.filters, blocker[0]))}>Nới điều kiện</Button>}>
                Chỉ tìm thấy {data.mentors.length} mentor: {blocker[1]} mentor bị loại bởi {describeFilter(blocker[0], data.filters)}.
              </Alert>
            )}
            <details className="text-small text-ink-muted">
              <summary className="cursor-pointer select-none font-medium text-ink">
                Cách AI chọn {data.mentors.length} mentor này từ {data.pipeline.considered} mentor
              </summary>
              <p className="mt-2 max-w-[90ch]">
                Xét {data.pipeline.considered} mentor, loại {excludedTotal} không đủ điều kiện
                {excludedTotal > 0 && ` (${excludedEntries.map(([k, v]) => `${v} ${EXCLUSION_LABELS[k] || k}`).join(", ")})`}, còn {data.pipeline.eligible} mentor
                thoả bộ lọc. Lấy {data.pipeline.retrieved} mentor gần nhất về nội dung (top-K = {data.pipeline.k}), rồi xếp hạng lại với
                trọng số tương đồng {data.pipeline.weights.similarity}, đánh giá {data.pipeline.weights.rating}, kinh nghiệm {data.pipeline.weights.experience},
                khớp lịch {data.pipeline.weights.scheduleFit}, phản hồi nhanh {data.pipeline.weights.responsiveness}.
              </p>
            </details>
            {data.pipeline.hidden > 0 && (
              <p className="-mt-3 text-small text-ink-muted">
                Đang ẩn {data.pipeline.hidden} mentor bạn đánh dấu không phù hợp. <Link href="/matching/hidden">Xem hoặc bỏ ẩn</Link>.
              </p>
            )}
            {data.mentors.length === 0 ? (
              <Card>
                <EmptyState icon={Sparkles} title="Chưa tìm thấy mentor phù hợp" action={<ButtonLink href="/mentors" size="sm">Duyệt danh sách mentor</ButtonLink>}>
                  Thử nới bộ lọc, hoặc bổ sung kỹ năng và mục tiêu trong hồ sơ.
                </EmptyState>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {data.mentors.map((m) => (
                  <MentorMatchCard key={m.mentorId} m={m} requested={requested.has(m.mentorId)}
                    onNotRelevant={async (reason, note) => {
                      try {
                        await matchingApi.notRelevant(user.userId, m.mentorId, reason, note, data.impressionId);
                        setHiddenMsg(`Đã ẩn ${m.displayName} trong 30 ngày.`);
                        search(lastFilters.current);
                      } catch (e) {
                        setError({ code: e instanceof ApiError ? e.code : "UNKNOWN", message: errorMessage(e) });
                      }
                    }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function MatchingPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Matching user={user} />}</RequireAuth>;
}
