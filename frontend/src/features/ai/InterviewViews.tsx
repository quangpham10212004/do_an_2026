"use client";

import { Alert, Card, CardBody, ScoreRing, StatusBadge } from "@/components/ui";
import type { Interview, InterviewStats, InterviewStrategy, InterviewTurn } from "@/types";

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
  if (!turn.rubric) return <div className="text-small text-ink-muted">Chưa có điểm theo tiêu chí (buổi phỏng vấn trước khi áp dụng rubric).</div>;
  const rubric = turn.rubric;
  return (
    <div className="flex flex-col gap-1.5 text-small">
      {RUBRIC.map((c) => {
        const v = rubric[c.key];
        const band = v <= 2 ? c.bands[0] : v < 7 ? c.bands[1] : c.bands[2];
        return (
          <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[200px_96px_minmax(0,1fr)]">
            <span>{c.label} <span className="text-ink-subtle">({c.weight}%)</span></span>
            <span className="flex items-center gap-2">
              <span className="progress w-12" aria-hidden="true"><span style={{ width: `${v * 10}%` }} /></span>
              <span className="font-mono tabular">{v}/10</span>
            </span>
            <span className="col-span-2 text-ink-muted sm:col-span-1">{band}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InterviewTranscript({ interview, admin = false }: { interview: Interview; admin?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {interview.turns.map((t) => (
        <div key={t.turnNo} className="chat">
          <div className="bubble-meta">Câu {t.turnNo} · {t.topic} · {STRATEGY_LABELS[t.strategy]}</div>
          <div className="bubble">{t.question}</div>
          {t.answer && <div className="bubble bubble-me">{t.answer}</div>}
          {t.score != null && (
            <div className="well mt-1 flex flex-col gap-2">
              <div><span className="font-mono font-medium tabular">{t.score}/10</span> <span className="text-ink-muted">· {t.feedback}</span></div>
              {admin && (
                <div className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
                  {t.flags.map((f) => <StatusBadge key={f} status={f} />)}
                  {formatDuration(t.durationSeconds) && <span>Thời gian trả lời: {formatDuration(t.durationSeconds)}</span>}
                  {t.engine && (
                    <span className="font-mono">
                      {t.engine}{t.model ? ` (${t.model})` : ""} · {t.promptVersion}{t.fallbackUsed ? " · fallback" : ""}
                    </span>
                  )}
                </div>
              )}
              {(admin || t.rubric) && <RubricTable turn={t} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** US-24: "80% (8/10)" — tỉ lệ quyết định admin trùng khuyến nghị AI. */
export function formatAgreement(stats: InterviewStats | null): string | null {
  if (!stats) return null;
  if (stats.agreementRate == null) return "Chưa có dữ liệu";
  return `${Math.round(stats.agreementRate * 100)}% (${stats.decisionsAgreeing}/${stats.decisionsComparable})`;
}

export function AssessmentCard({ interview }: { interview: Interview }) {
  if (interview.overallScore == null) return null;
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing value={interview.overallScore} size="lg" label="Điểm tổng hợp" />
          <div className="flex flex-col gap-1">
            <h2 className="text-title-2 font-semibold">Đánh giá tổng hợp</h2>
            <div className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
              AI khuyến nghị <StatusBadge status={interview.recommendation} /> · engine {interview.engine}
              {interview.flagged && <><StatusBadge status="NEEDS_REVIEW" /> có câu trả lời bị gắn cờ</>}
            </div>
          </div>
        </div>
        <p>{interview.summary}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="well">
            <div className="eyebrow mb-2">Điểm mạnh</div>
            <ul className="flex list-disc flex-col gap-1 pl-5">{interview.strengths.length ? interview.strengths.map((s) => <li key={s}>{s}</li>) : <li className="text-ink-muted">—</li>}</ul>
          </div>
          <div className="well">
            <div className="eyebrow mb-2">Cần cải thiện</div>
            <ul className="flex list-disc flex-col gap-1 pl-5">{interview.weaknesses.length ? interview.weaknesses.map((s) => <li key={s}>{s}</li>) : <li className="text-ink-muted">—</li>}</ul>
          </div>
        </div>
        {interview.reviewNote && <Alert tone="info" title="Nhận xét của quản trị viên">{interview.reviewNote}</Alert>}
      </CardBody>
    </Card>
  );
}
