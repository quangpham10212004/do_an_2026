"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Stars } from "@/components/ui";
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
  { key: "similarity", label: "Tương đồng hồ sơ", color: "var(--color-eager-green)" },
  { key: "rating", label: "Đánh giá", color: "var(--color-spark-blue)" },
  { key: "experience", label: "Kinh nghiệm", color: "var(--color-night-ink)" },
  { key: "scheduleFit", label: "Khớp lịch", color: "var(--color-sunshine, #f5b700)" },
  { key: "responsiveness", label: "Phản hồi nhanh", color: "var(--color-coral, #ff7a59)" },
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
    <div className="score-breakdown">
      <div className="score-bar" role="img" aria-label={`Điểm phù hợp ${pct(m.finalScore)}%: ${summary}`}>
        {parts.map((p) => <span key={p.key} style={{ width: `${p.value * 100}%`, background: p.color }} />)}
      </div>
      <div className="score-legend small muted">
        {parts.map((p) => (
          <span key={p.key}><i style={{ background: p.color }} />{p.label} +{pct(p.value)}</span>
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
    <div className="stack" style={{ marginTop: 8 }}>
      <div className="chips">
        {(Object.keys(NOT_RELEVANT_LABELS) as NotRelevantReason[]).map((r) => (
          <button key={r} type="button" className={`chip ${reason === r ? "match" : ""}`} onClick={() => setReason(r)}>{NOT_RELEVANT_LABELS[r]}</button>
        ))}
      </div>
      {reason === "OTHER" && <input value={note} maxLength={300} placeholder="Lý do (tuỳ chọn)" onChange={(e) => setNote(e.target.value)} />}
      <div className="row">
        <button className="btn danger sm" disabled={!reason || busy} onClick={async () => {
          if (!reason) return;
          setBusy(true);
          try {
            await onSubmit(reason, note.trim());
          } finally {
            setBusy(false);
          }
        }}>Ẩn mentor này 30 ngày</button>
        <button className="btn secondary sm" onClick={onCancel}>Thôi</button>
      </div>
    </div>
  );
}

function MentorMatchCard({ m, requested, onNotRelevant }: MentorMatchCardProps) {
  const [hiding, setHiding] = useState(false);
  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginBottom: 2 }}><Link href={`/mentors/${m.mentorId}`}>{m.displayName}</Link></h3>
          {m.headline && <div className="small" style={{ marginBottom: 2 }}>{m.headline}</div>}
          <div className="muted small">
            {m.domain} · {m.yearsExperience} năm KN · <span style={{ whiteSpace: "nowrap" }}>{formatRate(m.hourlyRate)}</span>
          </div>
          <div className="small" style={{ marginTop: 2 }}>
            {/* US-41 (PRD-REV-5) — sao chỉ hiện khi ≥ 3 đánh giá */}
            {m.ratingCount >= 3 && <><Stars value={m.rating} /> <span className="muted">({m.ratingCount})</span> </>}
            {m.newMentor && <span className="badge new">Mentor mới</span>}
            <span className="muted"> · Khớp lịch {pct(m.scheduleFit)}%</span>
            {m.medianResponseHours !== null && (
              <span className="muted"> · {m.medianResponseHours <= 24 ? "Phản hồi trong 24 giờ" : m.medianResponseHours <= 72 ? "Phản hồi trong 3 ngày" : "Phản hồi chậm"}</span>
            )}
          </div>
        </div>
        <div className="match-score">
          <div className="stat">{pct(m.finalScore)}%</div>
          <div className="stat-label">phù hợp</div>
        </div>
      </div>
      <ScoreBreakdown m={m} />
      <div className="chips" style={{ marginBottom: "0.6rem" }}>
        {m.skills.map((s) => <span key={s} className={`chip ${m.matchedSkills.includes(s) ? "match" : ""}`}>{s}</span>)}
      </div>
      <div className="small">
        <strong>Vì sao gợi ý mentor này?</strong>
        <ul style={{ margin: "4px 0 0.75rem", paddingLeft: "1.1rem" }}>
          {m.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      <div className="row">
        <Link className="btn secondary sm" href={`/mentors/${m.mentorId}`}>Xem hồ sơ</Link>
        {requested ? (
          <span className="badge good">Đã gửi yêu cầu</span>
        ) : (
          <Link className="btn sm" href={`/mentoring/request/${m.mentorId}`}>Gửi yêu cầu mentoring</Link>
        )}
        {!hiding && <button className="btn ghost sm" onClick={() => setHiding(true)}>Không phù hợp</button>}
      </div>
      {hiding && <NotRelevantForm onCancel={() => setHiding(false)} onSubmit={onNotRelevant} />}
    </div>
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
        <PageHead title="Mentor phù hợp với bạn" subtitle="AI Matching cần hồ sơ hoàn thiện tối thiểu 50% để gợi ý chính xác." />
        <Alert type="warn">Hồ sơ của bạn mới hoàn thiện {gate.score}%. <Link href="/profile">Bổ sung hồ sơ</Link> hoặc <Link href="/mentors">duyệt danh sách mentor</Link>.</Alert>
        <div style={{ maxWidth: 520 }}><CompletenessCard completeness={gate} matchingMin={50} /></div>
      </>
    );
  }
  if (data === undefined) return <Loading text="AI đang tìm mentor phù hợp..." />;
  const excluded = data?.pipeline?.excluded || {};
  const excludedEntries = Object.entries(excluded) as [ExclusionReason, number][];
  const excludedTotal = excludedEntries.reduce((sum, [, n]) => sum + n, 0);
  // US-18 — kết quả ít hơn LIMIT: chỉ ra bộ lọc loại nhiều mentor nhất và cho nới bằng một cú nhấp.
  const blocker = data && data.mentors.length < LIMIT ? biggestBlocker(data.excludedBy) : null;

  return (
    <>
      <PageHead title="Mentor phù hợp với bạn" subtitle="Xếp hạng theo độ tương đồng hồ sơ, đánh giá và kinh nghiệm — chỉ gồm mentor đã được xác thực, còn lịch rảnh và còn chỗ.">
        <Link href="/mentors" className="btn secondary">Xem tất cả mentor</Link>
        <Link href="/profile" className="btn secondary">Cập nhật hồ sơ</Link>
      </PageHead>
      {error?.code === "MENTEE_PROFILE_INCOMPLETE" && (
        <Alert type="warn">{error.message}. <Link href="/profile">Tạo hồ sơ ngay</Link></Alert>
      )}
      {error && error.code !== "MENTEE_PROFILE_INCOMPLETE" && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <MatchingFilters value={data.filters} fromProfile={data.filters.fromProfileDefaults} busy={busy}
            onSearch={(f) => search(f)} onUseProfile={() => search()} />
          {hiddenMsg && <Alert type="success">{hiddenMsg}</Alert>}
          {blocker && (
            <Alert type="warn">
              Chỉ tìm thấy {data.mentors.length} mentor: {blocker[1]} mentor bị loại bởi {describeFilter(blocker[0], data.filters)}.{" "}
              <button className="btn secondary sm" disabled={busy} onClick={() => search(dropFilter(data.filters, blocker[0]))}>Nới điều kiện</button>
            </Alert>
          )}
          <p className="muted small">
            Pipeline: xét {data.pipeline.considered} mentor → loại {excludedTotal} không đủ điều kiện
            {excludedTotal > 0 && ` (${excludedEntries.map(([k, v]) => `${v} ${EXCLUSION_LABELS[k] || k}`).join(", ")})`} → còn {data.pipeline.eligible} mentor
            thoả bộ lọc → lấy {data.pipeline.retrieved} mentor gần nhất về nội dung (top-K = {data.pipeline.k}) → xếp hạng lại với
            trọng số tương đồng {data.pipeline.weights.similarity}, đánh giá {data.pipeline.weights.rating}, kinh nghiệm {data.pipeline.weights.experience},
            khớp lịch {data.pipeline.weights.scheduleFit}, phản hồi nhanh {data.pipeline.weights.responsiveness}.
            {data.pipeline.hidden > 0 && <> Đang ẩn {data.pipeline.hidden} mentor bạn đánh dấu không phù hợp — <Link href="/matching/hidden">xem / bỏ ẩn</Link>.</>}
          </p>
          {data.mentors.length === 0 ? (
            <Empty>Chưa tìm thấy mentor phù hợp. Hãy thử nới bộ lọc, bổ sung kỹ năng/mục tiêu trong hồ sơ, hoặc <Link href="/mentors">duyệt toàn bộ danh sách mentor</Link>.</Empty>
          ) : (
            <div className="grid grid-2">
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
    </>
  );
}

export default function MatchingPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Matching user={user} />}</RequireAuth>;
}
