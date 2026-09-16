"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Stars, useDialog } from "@/components/ui";
import { EXCLUSION_LABELS, matchingApi } from "@/features/matching/api";
import { mentoringApi } from "@/features/mentoring/api";
import { formatRate } from "@/lib/format";

const pct = (x) => Math.round(x * 100);

/** Tách finalScore thành 3 phần theo trọng số pipeline. Phần đánh giá = phần còn lại, nên luôn khớp
 *  với cách matching-service tính (kể cả rating trung tính cho mentor chưa có đánh giá). */
function scoreParts(m, weights) {
  const similarity = m.similarityScore * weights.similarity;
  const experience = Math.min(m.yearsExperience / 10, 1) * weights.experience;
  const rating = Math.max(0, m.finalScore - similarity - experience);
  return [
    { key: "similarity", label: "Tương đồng hồ sơ", value: similarity, color: "var(--color-eager-green)" },
    { key: "rating", label: m.ratingCount > 0 ? "Đánh giá" : "Đánh giá (trung tính)", value: rating, color: "var(--color-spark-blue)" },
    { key: "experience", label: "Kinh nghiệm", value: experience, color: "var(--color-night-ink)" },
  ];
}

function ScoreBreakdown({ m, weights }) {
  const parts = scoreParts(m, weights);
  const summary = parts.map((p) => `${p.label} ${pct(p.value)}`).join(", ");
  return (
    <div className="score-breakdown">
      <div className="score-bar" role="img" aria-label={`Điểm phù hợp ${pct(m.finalScore)}%: ${summary}`}>
        {parts.map((p) => <span key={p.key} style={{ width: `${p.value * 100}%` }} />)}
      </div>
      <div className="score-legend small muted">
        {parts.map((p) => (
          <span key={p.key}><i style={{ background: p.color }} />{p.label} +{pct(p.value)}</span>
        ))}
      </div>
    </div>
  );
}

function MentorMatchCard({ m, weights, requested, onRequest }) {
  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginBottom: 2 }}><Link href={`/mentors/${m.mentorId}`}>{m.displayName}</Link></h3>
          <div className="muted small">
            {m.domain} · {m.yearsExperience} năm KN · <span style={{ whiteSpace: "nowrap" }}>{formatRate(m.hourlyRate)}</span>
          </div>
          <div className="small" style={{ marginTop: 2 }}>
            {m.ratingCount > 0
              ? <><Stars value={m.rating} /> <span className="muted">({m.ratingCount})</span></>
              : <span className="badge new">Mentor mới</span>}
          </div>
        </div>
        <div className="match-score">
          <div className="stat">{pct(m.finalScore)}%</div>
          <div className="stat-label">phù hợp</div>
        </div>
      </div>
      <ScoreBreakdown m={m} weights={weights} />
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
          <button className="btn sm" onClick={() => onRequest(m)}>Gửi yêu cầu mentoring</button>
        )}
      </div>
    </div>
  );
}

function Matching({ user }) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const [requested, setRequested] = useState(new Set());
  const [msg, setMsg] = useState("");
  const [dialog, ask] = useDialog();

  useEffect(() => {
    matchingApi.mentorsFor(user.userId, 10).then(setData).catch((e) => { setError(e); setData(null); });
    mentoringApi.requests().then((rs) => setRequested(new Set(rs.filter((r) => ["PENDING", "ACCEPTED"].includes(r.status)).map((r) => r.mentorId)))).catch(() => {});
  }, [user]);

  async function request(m) {
    const message = await ask({
      title: `Gửi yêu cầu tới ${m.displayName}`,
      message: "Mentor cần chấp nhận yêu cầu trước khi bạn đặt lịch.",
      input: { label: "Lời nhắn (tuỳ chọn)", defaultValue: "Chào anh/chị, em mong được anh/chị hướng dẫn." },
      confirmText: "Gửi yêu cầu",
    });
    if (message === null) return;
    try {
      await mentoringApi.createRequest(m.mentorId, message);
      setRequested(new Set([...requested, m.mentorId]));
      setMsg(`Đã gửi yêu cầu tới ${m.displayName}.`);
    } catch (e) {
      setMsg(e.message);
    }
  }

  if (data === undefined) return <Loading text="AI đang tìm mentor phù hợp..." />;
  const excluded = data?.pipeline?.excluded || {};
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead title="Mentor phù hợp với bạn" subtitle="Xếp hạng theo độ tương đồng hồ sơ, đánh giá và kinh nghiệm — chỉ gồm mentor đã được xác thực, còn lịch rảnh và còn chỗ.">
        <Link href="/profile" className="btn secondary">Cập nhật hồ sơ</Link>
      </PageHead>
      {dialog}
      {msg && <Alert type="info">{msg}</Alert>}
      {error?.code === "MENTEE_PROFILE_INCOMPLETE" && (
        <Alert type="warn">{error.message}. <Link href="/profile">Tạo hồ sơ ngay</Link></Alert>
      )}
      {error && error.code !== "MENTEE_PROFILE_INCOMPLETE" && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <p className="muted small">
            Pipeline: lấy {data.pipeline.retrieved} mentor gần nhất (top-K = {data.pipeline.k}) → loại {excludedTotal}
            {excludedTotal > 0 && ` (${Object.entries(excluded).map(([k, v]) => `${v} ${EXCLUSION_LABELS[k] || k}`).join(", ")})`} → xếp hạng lại với
            trọng số tương đồng {data.pipeline.weights.similarity}, đánh giá {data.pipeline.weights.rating}, kinh nghiệm {data.pipeline.weights.experience}.
          </p>
          {data.mentors.length === 0 ? (
            <Empty>Chưa tìm thấy mentor phù hợp. Hãy thử bổ sung kỹ năng/mục tiêu trong hồ sơ hoặc quay lại sau.</Empty>
          ) : (
            <div className="grid grid-2">
              {data.mentors.map((m) => <MentorMatchCard key={m.mentorId} m={m} weights={data.pipeline.weights} requested={requested.has(m.mentorId)} onRequest={request} />)}
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
