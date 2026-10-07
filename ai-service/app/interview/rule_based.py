"""
Engine phỏng vấn dựa trên luật — tất định, giải thích được, chạy offline.

Chấm 1 câu trả lời theo rubric 4 tiêu chí (PRD 6.1, mỗi tiêu chí 0–10; công thức chung ở rubric.py):
  - technical      : số khái niệm kỳ vọng của chủ đề được nêu (tối đa 4) + có phân tích đánh đổi / giới hạn
  - depth          : tín hiệu kinh nghiệm thực tế (dự án, production, sự cố...) + số liệu + giải thích quyết định
                     (đánh đổi) + độ dài; không có ví dụ cụ thể => tối đa 2
  - communication  : độ dài hợp lý + dấu hiệu cấu trúc (đầu tiên / sau đó / gạch đầu dòng) + ví dụ dễ hiểu
  - mentoring      : tín hiệu hướng dẫn (lộ trình, bài tập, feedback, mentee/junior, giải thích...)
Văn bản được so khớp ở dạng chữ thường KHÔNG DẤU, nên câu trả lời gõ không dấu vẫn được nhận diện.

Chiến lược hỏi (adaptive):
  - Câu trả lời đạt (điểm câu >= 5) và chủ đề chưa được đào sâu → DEEPEN (hỏi sâu hơn cùng chủ đề)
  - Ngược lại → PIVOT sang chủ đề liên quan chưa hỏi
"""
import re
import unicodedata
from collections import OrderedDict
from dataclasses import dataclass

from app.interview import rubric
from app.interview.models import FinalAssessment, InterviewContext, QuestionPlan, TurnEvaluation, TurnRecord
from app.interview.question_bank import BY_DOMAIN, Topic, topics_for
from app.interview.rubric import RubricScores, round1

NAME = "RULE_BASED"
PROMPT_VERSION = "rule-based-rubric-v1"
DEEPEN_THRESHOLD = 5.0


def normalize(text: str | None) -> str:
    """Chữ thường, bỏ dấu tiếng Việt (đ → d) để so khớp không phụ thuộc cách gõ."""
    t = unicodedata.normalize("NFD", (text or "").lower().replace("đ", "d"))
    return "".join(ch for ch in t if unicodedata.category(ch) != "Mn")


def _rx(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE | re.MULTILINE)


TRADEOFF = _rx(r"(trade-?offs?|danh doi|nhuoc diem|han che|gioi han|limitations?|downsides?|drawbacks?|tuy nhien|"
               r"however|khi nao khong|when not to|chi phi|\bcost|rui ro|\brisks?\b|uu diem|\bpros\b|\bcons\b|bat loi)")
EXPERIENCE = _rx(r"(vi du|chang han|du an|\bprojects?\b|production|thuc te|kinh nghiem|da tung|tung lam|benchmark|do dac|"
                 r"khach hang|su co|incident|postmortem|cong ty|\bcompany\b|in my (last |previous )?(job|team|role)|"
                 r"\bi (built|led|migrated|designed|reduced|wrote|set up|introduced)|\bwe (built|migrated|reduced|used|moved|had)|"
                 r"toi da|chung toi|nhom toi|team toi|\bmy team\b|at work|"
                 r"\bour (team|service|app|system|company|product|project|cluster|pipeline|platform|site)\b)")
NUMBER = _rx(r"\d+([.,]\d+)?\s?(%|ms\b|s\b|giay|phut|gio\b|x\b|lan\b|users?\b|nguoi dung|rps|qps|gb\b|mb\b|k\b|"
             r"trieu|million|requests?|ngay\b|tuan\b|thang\b|days?\b|weeks?\b|months?\b|hours?\b|minutes?\b)")
STRUCTURE = _rx(r"(thu nhat|thu hai|dau tien|tiep theo|sau do|cuoi cung|buoc \d|\bfirst(ly)?\b|\bsecond(ly)?\b|"
                r"\bthen\b|\bnext\b|\bfinally\b|step \d|^\s*([-*•]|\d+[.)])\s)")
FRIENDLY = _rx(r"(vi du|chang han|hinh dung|giong nhu|don gian|for example|e\.g\.|\bimagine\b|think of it|"
               r"\blike a\b|\bsimply\b|in simple terms|noi cach khac|in other words)")
TEACHING = _rx(r"(huong dan|\bmentees?\b|\bjuniors?\b|nguoi moi|nguoi hoc|giai thich|pair(ing)?\b|kem cap|review code|"
               r"code review|lo trinh|roadmap|bai tap|exercises?|feedback|phan hoi|\bteach|\bexplain|\bguide|unblock|"
               r"go vuong|dong luc|motivat|kien nhan|goi mo|1-1|1:1|muc tieu|\bgoals?\b|milestones?|checklist|tai lieu)")


def _distinct(pattern: re.Pattern, text: str) -> set[str]:
    return {m.group(0).strip().lower() for m in pattern.finditer(text)}


def _concepts(text: str, expected: tuple[str, ...] | list[str]) -> list[str]:
    """Khái niệm kỳ vọng xuất hiện trong câu trả lời (khớp đầu từ, không dấu)."""
    return [c for c in expected if re.search(r"(?<![a-z0-9])" + re.escape(normalize(c)), text)]


@dataclass(frozen=True)
class RubricBreakdown:
    rubric: RubricScores
    matched_concepts: list[str]
    feedback: str

    @property
    def total(self) -> float:
        return rubric.turn_score(self.rubric)


def assess(answer: str | None, expected_concepts: tuple[str, ...] | list[str]) -> RubricBreakdown:
    """Chấm 1 câu trả lời theo rubric 4 tiêu chí (hàm thuần, tất định)."""
    text = normalize(answer)
    words = len(text.split())
    matched = _concepts(text, expected_concepts)
    m = len(matched)
    tradeoff = bool(TRADEOFF.search(text))
    experience = len(_distinct(EXPERIENCE, text))
    has_number = bool(NUMBER.search(text))
    structured = bool(STRUCTURE.search(answer or ""))  or bool(STRUCTURE.search(text))
    friendly = bool(FRIENDLY.search(text))
    teaching = len(_distinct(TEACHING, text))

    if m == 0:
        technical = 1.0 if words >= 20 else 0.0
    else:
        technical = min(10.0, 2 + 1.5 * min(m, 4) + (2 if tradeoff else 0))
        if words < 15:  # liệt kê từ khoá, không giải thích
            technical = min(technical, 4.0)

    if experience == 0:  # không có ví dụ cụ thể => tối đa 2
        depth = min(2.0, (2 if has_number else 0) + (1 if words >= 80 else 0))
    else:
        depth = min(10.0, (4, 5, 6)[min(experience, 3) - 1] + (2 if has_number else 0)
                    + (1.5 if tradeoff else 0) + (1 if words >= 80 else 0))
    if words < 15:
        depth = min(depth, 2.0)

    communication = (0 if words < 5 else 2 if words < 15 else 4 if words < 30 else 5 if words < 60
                     else 6 if words < 120 else 7 if words <= 450 else 6)
    communication = min(10.0, communication + (2 if structured and words >= 15 else 0) + (1 if friendly else 0))

    mentoring = min(10.0, 2.5 * min(teaching, 4))

    scores = RubricScores(technical=round1(technical), depth=round1(depth),
                          communication=round1(float(communication)), mentoring=round1(mentoring))

    fb = []
    if not matched:
        fb.append("Câu trả lời chưa đề cập các khái niệm cốt lõi của chủ đề.")
    else:
        fb.append("Đã đề cập: " + ", ".join(matched[:5]) + ".")
        if not tradeoff:
            fb.append("Chưa phân tích đánh đổi / giới hạn của giải pháp.")
    fb.append("Có dẫn chứng từ kinh nghiệm thực tế." if experience else "Chưa có ví dụ hoặc dẫn chứng từ kinh nghiệm thực tế.")
    if words < 40:
        fb.append("Nên trình bày chi tiết hơn.")
    if not teaching:
        fb.append("Chưa thể hiện góc nhìn hướng dẫn người học.")
    return RubricBreakdown(scores, matched, " ".join(fb))


def _find_topic(ctx: InterviewContext, name: str) -> Topic | None:
    for t in topics_for(ctx.domain, ctx.skills):
        if t.name == name:
            return t
    return next((t for t in BY_DOMAIN["general"] if t.name == name), None)


def find_topic(domain: str, name: str) -> Topic | None:
    """Tra chủ đề theo tên (dùng cho script đánh giá offline)."""
    return _find_topic(InterviewContext(domain=domain, skills=[]), name)


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
    s = assess(current.answer, topic.expected_concepts if topic else ())
    flags = [rubric.FLAG_PROMPT_INJECTION] if rubric.detect_injection(current.answer) else []
    nxt = None if is_last_turn else _plan_next(ctx, history, current, s.total)
    return TurnEvaluation(rubric=s.rubric, score=s.total, feedback=s.feedback, flags=flags, next=nxt)


def summarize(ctx: InterviewContext, turns: list[TurnRecord]) -> FinalAssessment:
    scored = [t for t in turns if t.score is not None]
    overall = rubric.overall_score([t.score for t in scored])
    flagged = any(rubric.is_flagged(t.flags) for t in turns)

    by_topic: OrderedDict[str, list[float]] = OrderedDict()
    for t in scored:
        by_topic.setdefault(t.topic, []).append(t.score)
    averages = {k: sum(v) / len(v) for k, v in by_topic.items()}
    strengths = [f"{k} ({v:.1f}/10)" for k, v in averages.items() if v >= 7]
    weaknesses = [f"{k} ({v:.1f}/10)" for k, v in averages.items() if v < 5]

    rec = rubric.recommend(overall, flagged)
    if flagged:
        verdict = "Có câu trả lời bị gắn cờ (nghi chèn lệnh cho người chấm hoặc dán nội dung), admin cần đọc kỹ."
    elif rec == "APPROVE":
        verdict = "Câu trả lời thể hiện kiến thức vững và có dẫn chứng thực tế."
    elif rec == "REJECT":
        verdict = "Câu trả lời còn ngắn, thiếu các khái niệm cốt lõi hoặc thiếu ví dụ thực tế."
    else:
        verdict = "Kết quả ở mức trung bình, admin nên đọc kỹ các câu trả lời trước khi quyết định."
    summary = f"Mentor lĩnh vực {ctx.domain} hoàn thành {len(turns)} lượt phỏng vấn, điểm trung bình {overall:.1f}/100. {verdict}"
    return FinalAssessment(overall_score=overall, summary=summary, strengths=strengths, weaknesses=weaknesses, recommendation=rec)
