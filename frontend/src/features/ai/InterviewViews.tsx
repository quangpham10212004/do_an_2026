"use client";

import { Alert, ScoreRing, StatusBadge } from "@/components/ui";
import type { Interview, InterviewStrategy, InterviewTurn } from "@/types";

const STRATEGY_LABELS: Record<InterviewStrategy, string> = { OPENING: "Mở đầu", DEEPEN: "Đào sâu", PIVOT: "Chủ đề mới" };

/** Rubric chấm điểm AI Interview (PRD 6.1) — mỗi tiêu chí 0–10, điểm câu = tổng có trọng số. */
export const RUBRIC: { key: "technical" | "depth" | "communication" | "mentoring"; label: string; weight: number; bands: [string, string, string] }[] = [
  { key: "technical", label: "Độ chính xác kỹ thuật", weight: 40, bands: ["Sai hoặc lạc đề", "Đúng nhưng chung chung", "Đúng, nêu được đánh đổi và giới hạn"] },
  { key: "depth", label: "Chiều sâu / kinh nghiệm", weight: 30, bands: ["Không có ví dụ cụ thể", "Một ví dụ, ít chi tiết", "Dự án thực tế, số liệu, giải thích quyết định"] },
  { key: "communication", label: "Giao tiếp", weight: 15, bands: ["Khó theo dõi", "Dễ hiểu", "Có cấu trúc, phù hợp người mới"] },
  { key: "mentoring", label: "Năng lực hướng dẫn", weight: 15, bands: ["Không có góc nhìn hướng dẫn", "Có một số chỉ dẫn", "Kế hoạch rõ ràng để dạy / gỡ vướng cho mentee"] },
];

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m} phút ${seconds % 60} giây` : `${seconds} giây`;
}

/** US-23: điểm 4 tiêu chí của một câu trả lời, kèm mô tả mức điểm tương ứng (rubric PRD 6.1). */
export function RubricTable({ turn }: { turn: InterviewTurn }) {
  if (!turn.rubric) return <div className="small muted">Chưa có điểm theo tiêu chí (buổi phỏng vấn trước khi áp dụng rubric).</div>;
  const rubric = turn.rubric;
  return (
    <table className="small" style={{ marginTop: 6 }}>
      <tbody>
        {RUBRIC.map((c) => {
          const v = rubric[c.key];
          const band = v <= 2 ? c.bands[0] : v < 7 ? c.bands[1] : c.bands[2];
          return (
            <tr key={c.key}>
              <td>{c.label} ({c.weight}%)</td>
              <td><strong>{v}</strong>/10</td>
              <td className="muted">{band}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InterviewTranscript({ interview, admin = false }: { interview: Interview; admin?: boolean }) {
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
            <div className="feedback">
              <strong>{t.score}/10</strong> — {t.feedback}
              {admin && (
                <>
                  <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                    {t.flags.map((f) => <StatusBadge key={f} status={f} />)}
                    {formatDuration(t.durationSeconds) && <span className="muted">Thời gian trả lời: {formatDuration(t.durationSeconds)}</span>}
                    {t.engine && (
                      <span className="muted">
                        · {t.engine}{t.model ? ` (${t.model})` : ""} · {t.promptVersion}{t.fallbackUsed ? " · fallback" : ""}
                      </span>
                    )}
                  </div>
                  <RubricTable turn={t} />
                </>
              )}
              {!admin && t.rubric && <RubricTable turn={t} />}
            </div>
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
            {interview.flagged && <> · <StatusBadge status="NEEDS_REVIEW" /> có câu trả lời bị gắn cờ</>}
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

