"""
Engine phỏng vấn dựa trên luật — tất định, giải thích được, chạy offline.

Chấm điểm 1 câu trả lời (0-10) = độ bao phủ khái niệm (0-5)
                               + độ chi tiết theo số từ (0-3)
                               + dấu hiệu kinh nghiệm thực tế (0-2)

Chiến lược hỏi (adaptive):
  - Câu trả lời đạt (>= 5 điểm) và chủ đề chưa được đào sâu → DEEPEN (hỏi sâu hơn cùng chủ đề)
  - Ngược lại → PIVOT sang chủ đề liên quan chưa hỏi
"""
import math
import re
from collections import OrderedDict
from dataclasses import dataclass

from app.interview.models import FinalAssessment, InterviewContext, QuestionPlan, TurnEvaluation, TurnRecord
from app.interview.question_bank import BY_DOMAIN, Topic, topics_for

NAME = "RULE_BASED"
DEEPEN_THRESHOLD = 5.0
APPROVE_THRESHOLD = 70.0
REJECT_THRESHOLD = 45.0

EXPERIENCE_SIGNALS = re.compile(
    r"(ví dụ|chẳng hạn|dự án|project|production|thực tế|kinh nghiệm|đã từng|từng làm|trade-?off|đánh đổi|"
    r"đo đạc|benchmark|\d+\s?(%|ms|giây|người dùng|users|rps|request)|khách hàng|sự cố|incident)",
    re.IGNORECASE,
)


def round1(x: float) -> float:
    """Làm tròn 1 chữ số thập phân kiểu half-up (tránh làm tròn ngân hàng của Python)."""
    return math.floor(x * 10 + 0.5) / 10


@dataclass(frozen=True)
class ScoreBreakdown:
    coverage: float
    depth: float
    evidence: float
    matched_concepts: list[str]
    feedback: str

    @property
    def total(self) -> float:
        return round1(self.coverage + self.depth + self.evidence)


def score(answer: str | None, expected_concepts: tuple[str, ...] | list[str]) -> ScoreBreakdown:
    text = (answer or "").lower()
    matched = [c for c in expected_concepts if c.lower() in text]
    # Kỳ vọng nêu được ~4 khái niệm liên quan là đủ điểm tối đa phần bao phủ
    coverage = min(len(matched), 4) * 1.25

    words = len(text.split())
    depth = 0.0 if words < 15 else 1.0 if words < 40 else 2.0 if words < 80 else 3.0

    evidence = float(min(sum(1 for _ in EXPERIENCE_SIGNALS.finditer(text)), 2))

    fb = []
    if not matched:
        fb.append("Câu trả lời chưa đề cập các khái niệm cốt lõi của chủ đề.")
    else:
        fb.append("Đã đề cập: " + ", ".join(matched[:5]) + ".")
    if depth < 2:
        fb.append("Nên trình bày chi tiết hơn.")
    fb.append("Có dẫn chứng từ kinh nghiệm thực tế." if evidence else "Chưa có ví dụ hoặc dẫn chứng từ kinh nghiệm thực tế.")
    return ScoreBreakdown(coverage, depth, evidence, matched, " ".join(fb))


def _find_topic(ctx: InterviewContext, name: str) -> Topic | None:
    for t in topics_for(ctx.domain, ctx.skills):
        if t.name == name:
            return t
    return next((t for t in BY_DOMAIN["general"] if t.name == name), None)


def first_question(ctx: InterviewContext) -> QuestionPlan:
    first = topics_for(ctx.domain, ctx.skills)[0]
    intro = "" if not ctx.skills else "Bạn đã khai báo kinh nghiệm với " + ", ".join(ctx.skills[:3]) + ". "
    return QuestionPlan(topic=first.name, strategy="OPENING", question=intro + first.question)


def _plan_next(ctx: InterviewContext, history: list[TurnRecord], current: TurnRecord, turn_score: float) -> QuestionPlan:
    all_turns = [*history, current]
    deepened = {t.topic for t in all_turns if t.strategy == "DEEPEN"}
    topic = _find_topic(ctx, current.topic)
    if topic is not None and turn_score >= DEEPEN_THRESHOLD and topic.name not in deepened:
        return QuestionPlan(topic=topic.name, strategy="DEEPEN", question=topic.deepen_question)
    asked = {t.topic for t in all_turns}
    next_topic = next((t for t in topics_for(ctx.domain, ctx.skills) if t.name not in asked), BY_DOMAIN["general"][0])
    transition = "Cảm ơn bạn. Chúng ta chuyển sang một chủ đề khác. " if turn_score < DEEPEN_THRESHOLD else "Rất tốt. Tiếp theo, "
    return QuestionPlan(topic=next_topic.name, strategy="PIVOT", question=transition + next_topic.question)


def evaluate(ctx: InterviewContext, history: list[TurnRecord], current: TurnRecord, is_last_turn: bool) -> TurnEvaluation:
    topic = _find_topic(ctx, current.topic)
    s = score(current.answer, topic.expected_concepts if topic else ())
    nxt = None if is_last_turn else _plan_next(ctx, history, current, s.total)
    return TurnEvaluation(score=s.total, feedback=s.feedback, next=nxt)


def summarize(ctx: InterviewContext, turns: list[TurnRecord]) -> FinalAssessment:
    scored = [t for t in turns if t.score is not None]
    avg = sum(t.score for t in scored) / len(scored) if scored else 0.0
    overall = math.floor(avg * 100 + 0.5) / 10  # 0-10 → 0-100, làm tròn 1 chữ số

    by_topic: OrderedDict[str, list[float]] = OrderedDict()
    for t in scored:
        by_topic.setdefault(t.topic, []).append(t.score)
    averages = {k: sum(v) / len(v) for k, v in by_topic.items()}
    strengths = [f"{k} ({v:.1f}/10)" for k, v in averages.items() if v >= 7]
    weaknesses = [f"{k} ({v:.1f}/10)" for k, v in averages.items() if v < 5]

    if overall >= APPROVE_THRESHOLD:
        rec, verdict = "APPROVE", "Câu trả lời thể hiện kiến thức vững và có dẫn chứng thực tế."
    elif overall < REJECT_THRESHOLD:
        rec, verdict = "REJECT", "Câu trả lời còn ngắn, thiếu các khái niệm cốt lõi hoặc thiếu ví dụ thực tế."
    else:
        rec, verdict = "NEEDS_REVIEW", "Kết quả ở mức trung bình, admin nên đọc kỹ các câu trả lời trước khi quyết định."
    summary = f"Mentor lĩnh vực {ctx.domain} hoàn thành {len(turns)} lượt phỏng vấn, điểm trung bình {overall:.1f}/100. {verdict}"
    return FinalAssessment(overall_score=overall, summary=summary, strengths=strengths, weaknesses=weaknesses, recommendation=rec)
