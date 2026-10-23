"use client";

import { CalendarCheck } from "lucide-react";
import { Alert, ButtonLink, Card, CardBody, CardHeader, ScoreRing, Stat, Stats, StatusBadge } from "@/components/ui";
import { MOCK_LEVEL_LABELS, MOCK_TYPE_LABELS } from "@/features/mentoring/mockLabels";
import type { Practice, PracticeRubric } from "@/types";

/** FR-10.x — rubric luyện phỏng vấn (mỗi tiêu chí 0–10). */
export const PRACTICE_RUBRIC: { key: keyof PracticeRubric; label: string; weight: number }[] = [
  { key: "technical", label: "Kiến thức kỹ thuật", weight: 35 },
  { key: "problemSolving", label: "Giải quyết vấn đề & chiều sâu", weight: 25 },
  { key: "communication", label: "Trình bày rõ ràng", weight: 25 },
  { key: "structure", label: "Cấu trúc (STAR / cách tiếp cận)", weight: 15 },
];

/** Gợi ý bước tiếp theo: phỏng vấn thử với mentor thật (US-58). */
export function MockInterviewCta({ title = "Luyện tiếp với người thật" }: { title?: string }) {
  return (
    <Alert tone="info" title={title} action={<ButtonLink href="/matching" variant="primary" icon={CalendarCheck}>Đặt phỏng vấn thử với mentor</ButtonLink>}>
      Mentor có kinh nghiệm tuyển dụng sẽ phỏng vấn bạn như thật và chấm phiếu đánh giá chi tiết.
    </Alert>
  );
}

function RubricBars({ rubric }: { rubric: PracticeRubric }) {
  return (
    <div className="flex flex-col gap-1.5 text-small">
      {PRACTICE_RUBRIC.map((c) => (
        <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[240px_96px]">
          <span>{c.label} <span className="text-ink-subtle">({c.weight}%)</span></span>
          <span className="flex items-center gap-2">
            <span className="progress w-12" aria-hidden="true"><span style={{ width: `${rubric[c.key] * 10}%` }} /></span>
            <span className="font-mono tabular">{rubric[c.key]}/10</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function practiceTitle(p: Practice): string {
  return `${MOCK_TYPE_LABELS[p.interviewType]} · ${MOCK_LEVEL_LABELS[p.level]} · ${p.targetRole}${p.targetCompany ? ` @ ${p.targetCompany}` : ""}`;
}

/** Kết quả buổi luyện: điểm tổng, 3 điểm mạnh, 3 việc cần cải thiện, báo cáo cách nói, nhận xét từng câu. */
export function PracticeResultView({ practice }: { practice: Practice }) {
  const r = practice.result;
  if (!r) {
    return practice.status === "ABANDONED"
      ? <Alert>Buổi luyện quá 30 phút chưa hoàn thành nên bị huỷ và đã tính là lượt miễn phí.</Alert>
      : <Alert tone="info">Buổi luyện đang diễn ra — kết quả sẽ có sau khi kết thúc.</Alert>;
  }
  const sp = r.speaking;
  const fillers = Object.entries(sp.fillers).sort((a, b) => b[1] - a[1]).map(([w, n]) => `“${w}” ×${n}`).join(", ");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <ScoreRing value={r.overallScore} size="lg" label="Điểm tổng" />
            <div className="flex flex-col gap-1">
              <h2 className="text-title-2 font-semibold">Kết quả luyện phỏng vấn</h2>
              <div className="text-small text-ink-muted">{practiceTitle(practice)} · engine {r.engine}</div>
            </div>
          </div>
          <p>{r.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="well">
              <div className="eyebrow mb-2">3 điểm mạnh</div>
              <ul className="flex list-disc flex-col gap-1 pl-5">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div className="well">
              <div className="eyebrow mb-2">3 việc cần cải thiện</div>
              <ol className="flex list-decimal flex-col gap-1 pl-5">{r.improvements.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          </div>
        </CardBody>
      </Card>

      <Stats>
        <Stat label="Từ đệm" value={<span className="tabular">{sp.fillerCount}</span>} hint={fillers || "Không dùng từ đệm"} />
        <Stat label="Số từ trung bình / câu" value={<span className="tabular">{sp.avgWordsPerAnswer}</span>} hint={`${sp.answerCount} câu có trả lời`} />
        <Stat label="Câu dưới 20 từ" value={<span className="tabular">{sp.shortAnswers}</span>} hint={sp.unanswered ? `${sp.unanswered} câu bỏ trống` : "Nên nói ít nhất 20 từ mỗi câu"} />
      </Stats>

      <Card>
        <CardHeader title="Nhận xét từng câu" />
        <CardBody className="flex flex-col gap-6">
          {r.turns.map((t) => (
            <div key={t.topicNo} className="chat">
              <div className="bubble-meta">Câu {t.topicNo} · {t.topic}</div>
              <div className="bubble">{t.question}</div>
              <div className="bubble bubble-me">{t.answer}</div>
              <div className="well mt-1 flex flex-col gap-2">
                <div>
                  <span className="font-mono font-medium tabular">{t.score}/10</span> <span className="text-ink-muted">· {t.feedback}</span>
                  {t.flags.map((f) => <span key={f}> <StatusBadge status={f} /></span>)}
                </div>
                <RubricBars rubric={t.rubric} />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <MockInterviewCta />
    </div>
  );
}
