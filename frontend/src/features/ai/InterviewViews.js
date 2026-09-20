"use client";

import { Alert, ScoreRing, StatusBadge } from "@/components/ui";

const STRATEGY_LABELS = { OPENING: "Mở đầu", DEEPEN: "Đào sâu", PIVOT: "Chủ đề mới" };

export function InterviewTranscript({ interview }) {
  return (
    <div className="chat">
      {interview.turns.map((t) => (
        <div key={t.turnNo} className="chat">
          <div className="bubble bot">
            <div className="meta">Câu {t.turnNo} · {t.topic} · {STRATEGY_LABELS[t.strategy]}</div>
            {t.question}
          </div>
          {t.answer && <div className="bubble me">{t.answer}</div>}
          {t.score != null && (
            <div className="feedback"><strong>{t.score}/10</strong> — {t.feedback}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AssessmentCard({ interview }) {
  if (interview.overallScore == null) return null;
  return (
    <div className="card">
      <div className="row">
        <ScoreRing value={interview.overallScore} />
        <div>
          <h2 style={{ margin: 0 }}>Đánh giá tổng hợp</h2>
          <div className="row small">
            AI khuyến nghị: <StatusBadge status={interview.recommendation} /> · engine {interview.engine}
          </div>
        </div>
      </div>
      <p style={{ marginTop: "0.75rem" }}>{interview.summary}</p>
      <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <strong>Điểm mạnh</strong>
          <ul className="small">{interview.strengths.length ? interview.strengths.map((s) => <li key={s}>{s}</li>) : <li className="muted">—</li>}</ul>
        </div>
        <div>
          <strong>Cần cải thiện</strong>
          <ul className="small">{interview.weaknesses.length ? interview.weaknesses.map((s) => <li key={s}>{s}</li>) : <li className="muted">—</li>}</ul>
        </div>
      </div>
      {interview.reviewNote && <Alert type="info">Nhận xét của admin: {interview.reviewNote}</Alert>}
    </div>
  );
}

