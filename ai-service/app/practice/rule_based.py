"""
Engine rule-based chấm buổi luyện phỏng vấn của mentee (FR-10.x) — tất định, chạy offline (CI không có DeepSeek key).

Chấm 1 câu trả lời theo rubric 4 tiêu chí (practice/rubric.py, mỗi tiêu chí 0–10):
  - technical        : số khái niệm kỳ vọng của chủ đề được nêu (tối đa 4) + có lập luận / đánh đổi; quá ngắn => tối đa 4
  - problem_solving  : tín hiệu lập luận (vì, nếu, so sánh, thay vì...) + đánh đổi + ví dụ thực tế + số liệu + độ dài
  - communication    : độ dài hợp lý + có cấu trúc − phạt khi tỉ lệ từ đệm cao (ừm, à, kiểu như...)
  - structure        : BEHAVIORAL — đủ 4 phần STAR (mỗi phần 2,5 điểm); dạng kỹ thuật — các bước / cách tiếp cận rõ ràng
Văn bản được so khớp ở dạng chữ thường KHÔNG DẤU (dùng lại interview/rule_based.normalize và các biểu thức chung).
"""
import re

from app.interview import rubric as interview_rubric
from app.interview.rule_based import EXPERIENCE, NUMBER, STRUCTURE, TRADEOFF, normalize
from app.interview.rubric import round1
from app.practice import bank, rubric, speaking
from app.practice.models import PracticeAnswer, PracticeContext, TurnGrade
from app.practice.rubric import PracticeRubric

NAME = "RULE_BASED"
PROMPT_VERSION = "rule-based-practice-v1"
NO_ANSWER = "(Bạn không trả lời câu hỏi này.)"


def _rx(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE | re.MULTILINE)


REASONING = _rx(r"(\bvi\b|boi vi|\bbecause\b|do do|vi vay|\btherefore\b|\bso sanh\b|\bcompare|thay vi|\binstead\b|"
                r"\bneu\b|\bif\b|gia su|\bassum|phuong an|lua chon|\boption|\bnguyen nhan\b|root cause|\bde tranh\b|"
                r"\bavoid\b|truong hop|edge case)")
APPROACH = _rx(r"(cach tiep can|\bapproach\b|truoc het|dau tien|\bbuoc \d|\bstep\b|sau do|tiep theo|cuoi cung|"
               r"lam ro|yeu cau|requirements?|uoc luong|estimate|tom lai|ket luan|\bin summary\b|\bfirst(ly)?\b|\bthen\b|\bfinally\b)")
STAR = {
    "S": _rx(r"(tinh huong|boi canh|luc do|khi do|hoi do|thoi diem|\bsituation\b|\bcontext\b|o du an|o cong ty|trong mon|"
             r"nam (ngoai|truoc)|ky truoc|hoc ky)"),
    "T": _rx(r"(nhiem vu|muc tieu|can phai|duoc giao|trach nhiem|\btask\b|\bgoal\b|yeu cau la|phai hoan thanh)"),
    "A": _rx(r"(toi da|em da|minh da|chung toi da|nhom toi da|toi quyet dinh|toi bat dau|hanh dong|\baction\b|"
             r"\bi (did|decided|started|talked|wrote|built|asked)\b|toi chu dong|toi de xuat)"),
    "R": _rx(r"(ket qua|ket thuc|hoan thanh|giam|tang|cai thien|thanh cong|\bresult|bai hoc|rut ra|\blearned\b|"
             r"\boutcome\b|duoc khen|dung han)"),
}


def _concepts(text: str, expected: tuple[str, ...]) -> list[str]:
    return [c for c in expected if re.search(r"(?<![a-z0-9])" + re.escape(normalize(c)), text)]


def star_parts(answer: str | None) -> list[str]:
    text = normalize(answer)
    return [k for k, rx in STAR.items() if rx.search(text)]


def assess(ctx: PracticeContext, topic: bank.PracticeTopic | None, answer: str) -> tuple[PracticeRubric, str]:
    """Chấm 1 câu trả lời (hàm thuần, tất định) → (điểm 4 tiêu chí, nhận xét)."""
    if not answer.strip():
        return (PracticeRubric(technical=0, problem_solving=0, communication=0, structure=0),
                "Bạn chưa trả lời câu hỏi này. Khi chưa chắc, hãy nói cách bạn sẽ suy nghĩ thay vì im lặng.")
    text = normalize(answer)
    words = len(text.split())
    matched = _concepts(text, topic.expected_concepts if topic else ())
    m = len(matched)
    tradeoff = bool(TRADEOFF.search(text))
    reasoning = len({x.group(0).strip() for x in REASONING.finditer(text)})
    experience = bool(EXPERIENCE.search(text))
    has_number = bool(NUMBER.search(text))
    structured = bool(STRUCTURE.search(answer)) or bool(STRUCTURE.search(text))
    fillers = sum(speaking.filler_counts(answer).values())
    behavioral = ctx.interview_type == "BEHAVIORAL"

    if m == 0:
        technical = 1.0 if words >= 20 else 0.0
    else:
        technical = min(10.0, 2 + 1.5 * min(m, 4) + (2 if tradeoff or reasoning >= 2 else 0))
        if words < 15:
            technical = min(technical, 4.0)

    problem_solving = min(10.0, 1.5 * min(reasoning, 3) + (2 if tradeoff else 0) + (2 if experience else 0)
                          + (1 if has_number else 0) + (1 if words >= 80 else 0))
    if words < 15:
        problem_solving = min(problem_solving, 2.0)

    communication = (0 if words < 5 else 2 if words < 15 else 4 if words < 30 else 5 if words < 60
                     else 6 if words < 120 else 7 if words <= 450 else 6)
    communication += 2 if structured and words >= 15 else 0
    ratio = fillers / max(words, 1)
    communication -= 2 if ratio > 0.05 else 1 if ratio > 0.02 else 0
    communication = max(0.0, min(10.0, float(communication)))

    if behavioral:
        parts = star_parts(answer)
        structure = 2.5 * len(parts)
    else:
        steps = len({x.group(0).strip() for x in APPROACH.finditer(text)})
        structure = min(10.0, 2.5 * steps)
    if words < 15:
        structure = min(structure, 2.0)

    scores = PracticeRubric(technical=round1(technical), problem_solving=round1(problem_solving),
                            communication=round1(communication), structure=round1(structure))

    fb = []
    if matched:
        fb.append("Đã nêu được: " + ", ".join(matched[:5]) + ".")
    else:
        fb.append("Chưa nêu các ý chính nhà tuyển dụng mong đợi ở câu này.")
    if reasoning < 2 and not tradeoff:
        fb.append("Nên giải thích vì sao chọn cách làm đó và so sánh với phương án khác.")
    if behavioral:
        missing = [bank.STAR_LABELS[k] for k in "STAR" if k not in star_parts(answer)]
        fb.append("Trả lời đủ khung STAR." if not missing else "Còn thiếu phần STAR: " + ", ".join(missing).lower() + ".")
    elif structure < 5:
        fb.append("Nên trình bày theo các bước: làm rõ yêu cầu → hướng giải → đánh đổi → kết luận.")
    if words < speaking.SHORT_ANSWER_WORDS:
        fb.append("Câu trả lời còn ngắn, hãy nói thêm ví dụ cụ thể.")
    if ratio > 0.02:
        fb.append("Dùng khá nhiều từ đệm; thử dừng một nhịp thay vì nói \"ừm\", \"kiểu như\".")
    return scores, " ".join(fb)


def grade_turn(ctx: PracticeContext, a: PracticeAnswer) -> TurnGrade:
    topic = bank.find(ctx.interview_type, a.topic)
    if topic is None and a.topic in ctx.planned_concepts:  # chủ đề do AI soạn (v2.1): chỉ có khái niệm kỳ vọng
        topic = bank.PracticeTopic(a.topic, "", "", tuple(ctx.planned_concepts[a.topic]))
    r, feedback = assess(ctx, topic, a.answer)
    flags = [interview_rubric.FLAG_PROMPT_INJECTION] if interview_rubric.detect_injection(a.answer) else []
    return TurnGrade(topic_no=a.topic_no, topic=a.topic, question=a.question, answer=a.answer or NO_ANSWER,
                     score=rubric.turn_score(r), rubric=r, feedback=feedback, flags=flags)


_LABELS = {"technical": "kiến thức kỹ thuật", "problem_solving": "giải quyết vấn đề", "communication": "trình bày rõ ràng",
           "structure": "cấu trúc câu trả lời"}
_STRENGTH = {
    "technical": "Nắm được các khái niệm chính của chủ đề và dùng thuật ngữ đúng.",
    "problem_solving": "Có lập luận cho lựa chọn của mình thay vì chỉ nêu đáp án.",
    "communication": "Trình bày dễ theo dõi, độ dài câu trả lời hợp lý.",
    "structure": "Câu trả lời có trình tự rõ ràng.",
}
_IMPROVE = {
    "technical": "Ôn lại kiến thức nền của các chủ đề đã hỏi và nêu đủ ý chính trước khi đi vào chi tiết.",
    "problem_solving": "Mỗi câu trả lời nên có \"vì sao\": so sánh ít nhất hai phương án và nêu đánh đổi.",
    "communication": "Nói chậm và trọn ý hơn; trả lời thẳng câu hỏi trong 1–2 câu đầu rồi mới giải thích.",
    "structure": "Luyện trả lời theo khung: STAR cho câu hỏi hành vi, các bước rõ ràng cho câu hỏi kỹ thuật.",
}


def summarize(ctx: PracticeContext, turns: list[TurnGrade], report: speaking.SpeakingReport) -> tuple[str, list[str], list[str]]:
    """Nhận xét chung + đúng 3 điểm mạnh + đúng 3 việc cần cải thiện (danh sách hành động của mentee)."""
    overall = rubric.overall_score([t.score for t in turns])
    avg = {k: sum(getattr(t.rubric, k) for t in turns) / len(turns) for k in rubric.WEIGHTS}
    ranked = sorted(avg, key=lambda k: (-avg[k], list(rubric.WEIGHTS).index(k)))
    strengths = [_STRENGTH[k] if avg[k] >= 5 else f"Có nền tảng ban đầu về {_LABELS[k]} để phát triển thêm." for k in ranked[:3]]
    improvements = [_IMPROVE[k] for k in reversed(ranked)]
    if report.filler_count >= 3:
        improvements.insert(1, f"Giảm từ đệm (đã dùng {report.filler_count} lần): ghi âm và tự nghe lại câu trả lời của mình.")
    if report.short_answers or report.unanswered:
        improvements.insert(1, "Có câu trả lời quá ngắn hoặc bỏ trống: mỗi câu nên có ít nhất một ví dụ từ dự án hoặc bài tập bạn đã làm.")
    best = max(turns, key=lambda t: t.score)
    company = f" tại {ctx.target_company}" if ctx.target_company else ""
    summary = (f"Buổi luyện phỏng vấn {ctx.interview_type.replace('_', ' ').lower()} cho vị trí {ctx.target_role}{company} "
               f"(cấp {ctx.level}): {len(turns)} chủ đề, điểm tổng {overall:.0f}/100. Bạn làm tốt nhất ở chủ đề "
               f"\"{best.topic}\"; cần cải thiện nhất về {_LABELS[ranked[-1]]}.")
    return summary, strengths, improvements[:3]
