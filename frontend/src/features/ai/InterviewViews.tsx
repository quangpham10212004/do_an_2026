"use client";

import { Alert, ScoreRing, StatusBadge } from "@/components/ui";
import type { Interview, InterviewStrategy } from "@/types";

const STRATEGY_LABELS: Record<InterviewStrategy, string> = { OPENING: "Mở đầu", DEEPEN: "Đào sâu", PIVOT: "Chủ đề mới" };

/** Rubric chấm điểm AI Interview (PRD 6.1) — mỗi tiêu chí 0–10, điểm câu = tổng có trọng số. */
export const RUBRIC: { key: "technical" | "depth" | "communication" | "mentoring"; label: string; weight: number; bands: [string, string, string] }[] = [
  { key: "technical", label: "Độ chính xác kỹ thuật", weight: 40, bands: ["Sai hoặc lạc đề", "Đúng nhưng chung chung", "Đúng, nêu được đánh đổi và giới hạn"] },
  { key: "depth", label: "Chiều sâu / kinh nghiệm", weight: 30, bands: ["Không có ví dụ cụ thể", "Một ví dụ, ít chi tiết", "Dự án thực tế, số liệu, giải thích quyết định"] },
  { key: "communication", label: "Giao tiếp", weight: 15, bands: ["Khó theo dõi", "Dễ hiểu", "Có cấu trúc, phù hợp người mới"] },
  { key: "mentoring", label: "Năng lực hướng dẫn", weight: 15, bands: ["Không có góc nhìn hướng dẫn", "Có một số chỉ dẫn", "Kế hoạch rõ ràng để dạy / gỡ vướng cho mentee"] },
];

export function InterviewTranscript({ interview }: { interview: Interview }) {
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

export function AssessmentCard({ interview }: { interview: Interview }) {
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

