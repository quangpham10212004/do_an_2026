"""Quy tắc và view của phỏng vấn AI trực tiếp xác thực mentor (frontend: features/verification).

Mỗi lượt xác thực = một lĩnh vực; mentor trả lời bằng giọng nói từng chủ đề, engine chấm từng câu theo rubric
4 tiêu chí (interview/rubric.py, thang 0–10) rồi tổng hợp sang thang 5 của giao diện:
  điểm tổng (thang 5) = điểm tổng rubric (0–100) / 20
  >= PASS_SCORE (3.5 = ngưỡng APPROVE của rubric) → PASSED, < REJECT_SCORE (2.5) → FAILED, ở giữa hoặc có cờ → UNCLEAR
Chủ đề không được trả lời tính 0 điểm, nên bỏ dở nửa chừng không thể đạt.
"""
from datetime import UTC, datetime, timedelta

from app.interview import rubric
from app.interview.question_bank import topics_for
from app.interview.rubric import round1

DOMAINS = ("backend", "frontend", "fullstack", "devops", "data", "mobile")
TOPIC_COUNT = 5
MAX_MINUTES = 30
RESUME_HOURS = 24
RETAKE_DAYS = 7
OVERDUE_DAYS = 3
PASS_SCORE = rubric.APPROVE_THRESHOLD / 20       # 3.5
REJECT_SCORE = rubric.REJECT_THRESHOLD / 20      # 2.5
SUGGESTED_SECONDS = 120
FLAG_NO_TRANSCRIPT = "NO_TRANSCRIPT"

# (khoá hiển thị, nhãn, tiêu chí rubric tương ứng)
CRITERIA = (
    ("knowledge", "Kiến thức chuyên môn", "technical"),
    ("depth", "Chiều sâu và kinh nghiệm thực tế", "depth"),
    ("communication", "Giao tiếp, trình bày", "communication"),
    ("mentoring", "Khả năng hướng dẫn", "mentoring"),
)
COMMENTS = {
    "knowledge": ("Nắm chắc nguyên lý nền tảng, dùng thuật ngữ chính xác.",
                  "Hiểu đúng ý chính nhưng còn vài chỗ chưa chắc.",
                  "Nhiều khái niệm cơ bản còn thiếu hoặc nhầm lẫn."),
    "depth": ("Có ví dụ thực tế kèm số liệu và bài học rút ra.",
              "Có ví dụ nhưng chưa đi sâu vào lý do chọn giải pháp.",
              "Chủ yếu nói lý thuyết, thiếu ví dụ từ dự án thật."),
    "communication": ("Trình bày mạch lạc, dễ nghe.",
                      "Dễ hiểu nhưng đôi lúc vòng vo.",
                      "Câu trả lời ngắn, khó nắm ý."),
    "mentoring": ("Giải thích từng bước, phù hợp để hướng dẫn người mới.",
                  "Có khả năng giải thích nhưng chưa điều chỉnh theo người nghe.",
                  "Chưa thấy cách dẫn dắt người học."),
}
IMPROVEMENTS = {
    "knowledge": "Ôn lại khái niệm nền tảng của lĩnh vực và dùng đúng thuật ngữ khi giải thích.",
    "depth": "Bổ sung ví dụ cụ thể từ dự án thật, kèm số liệu và lý do chọn giải pháp.",
    "communication": "Trả lời đủ ý và có cấu trúc (bối cảnh, cách làm, kết quả), tránh câu quá ngắn.",
    "mentoring": "Nêu cách bạn hướng dẫn người mới: chia nhỏ bước, giao bài tập và phản hồi.",
}
SUMMARIES = {
    "PASSED": "Bạn trả lời tự tin, có ví dụ thực tế và đủ chiều sâu cho lĩnh vực này.",
    "FAILED": "Một số tiêu chí chưa đạt mức yêu cầu của lĩnh vực.",
    "UNCLEAR": "AI chưa thể kết luận chắc chắn, hồ sơ được chuyển cho quản trị viên xem xét.",
}


def now() -> datetime:
    return datetime.now(UTC)


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value)


def rules_view(topics: list[str]) -> dict:
    return dict(maxMinutes=MAX_MINUTES, topics=topics, resumeHours=RESUME_HOURS, retakeDays=RETAKE_DAYS,
                passScore=PASS_SCORE)


def plan(domain: str, skills: list[str], new_id) -> list[dict]:
    """Kế hoạch câu hỏi cố định cho cả buổi: mỗi chủ đề một câu, ưu tiên chủ đề khớp kỹ năng mentor khai báo."""
    return [dict(id=str(new_id()), topic=t.name, question=t.question, concepts=list(t.expected_concepts))
            for t in topics_for(domain, skills)[:TOPIC_COUNT]]


def topic_names(domain: str, skills: list[str]) -> list[str]:
    return [t.name for t in topics_for(domain, skills)[:TOPIC_COUNT]]


def greeting(domain: str, first_question: str) -> str:
    return (f"Chào bạn, mình là người phỏng vấn AI của MentorHub. Hôm nay mình sẽ hỏi về lĩnh vực {domain}. "
            f"{first_question}")


CLOSING = "Cảm ơn bạn, đó là câu hỏi cuối cùng. Bạn có thể bấm Kết thúc và nộp bài để mình chấm điểm."


def question_view(plan_: list[dict], index: int) -> dict | None:
    if index >= len(plan_):
        return None
    item = plan_[index]
    return dict(id=item["id"], topic=item["topic"], text=item["question"], isLast=index == len(plan_) - 1,
                suggestedSeconds=SUGGESTED_SECONDS)


def interview_view(row, details: dict) -> dict:
    return dict(
        id=row["id"], trackId=row["track_id"], domain=details["domain"], status=row["status"],
        startedAt=row["started_at"].isoformat(), resumeDeadline=row["resume_deadline"].isoformat(),
        remainingSeconds=max(0, round(details["remaining"])), topics=[p["topic"] for p in details["plan"]],
        topicIndex=min(details["index"], len(details["plan"]) - 1),
        question=question_view(details["plan"], details["index"]) if row["status"] == "IN_PROGRESS" else None,
        turns=details["turns"])


def band(score: float) -> int:
    return 0 if score >= PASS_SCORE else 1 if score >= REJECT_SCORE else 2


def grade(answers: list[dict], planned: int) -> dict:
    """Tổng hợp các câu đã chấm (mỗi phần tử: evaluation = {rubric, score, flags}); câu thiếu tính 0."""
    planned = max(planned, len(answers), 1)
    flags = sorted({f for a in answers for f in a["flags"]})
    criteria = []
    for key, label, source in CRITERIA:
        score = round1(sum(a["rubric"][source] for a in answers) / planned / 2)
        criteria.append(dict(key=key, label=label, score=score, comment=COMMENTS[key][band(score)]))
    turn_scores = [a["score"] for a in answers] + [0.0] * (planned - len(answers))
    overall = rubric.overall_score(turn_scores)
    total = round1(overall / 20)
    flagged = bool(flags)
    if flagged:
        outcome = "UNCLEAR"
    elif total >= PASS_SCORE:
        outcome = "PASSED"
    elif total < REJECT_SCORE:
        outcome = "FAILED"
    else:
        outcome = "UNCLEAR"
    recommendation = {"NEEDS_REVIEW": "REVIEW"}.get(rubric.recommend(overall, flagged),
                                                    rubric.recommend(overall, flagged))
    gap = min(abs(total - PASS_SCORE), abs(total - REJECT_SCORE))
    confidence = "LOW" if flagged or gap < 0.5 else "MEDIUM" if gap < 1 else "HIGH"
    weakest = sorted(criteria, key=lambda c: c["score"])[:3]
    improvements = [IMPROVEMENTS[c["key"]] for c in weakest if c["score"] < PASS_SCORE] if outcome == "FAILED" else []
    return dict(total=total, criteria=criteria, outcome=outcome, recommendation=recommendation,
                confidence=confidence, flags=flags, improvements=improvements, summary=SUMMARIES[outcome])


def ai_reason(grading: dict, answers: list[dict], planned: int) -> str:
    """Lý do AI cho quản trị viên: điểm, ngưỡng, cờ và chủ đề yếu nhất."""
    parts = [f"Điểm tổng {grading['total']:.1f}/5 (đạt từ {PASS_SCORE:.1f}, không đạt dưới {REJECT_SCORE:.1f})."]
    if len(answers) < planned:
        parts.append(f"Mới trả lời {len(answers)}/{planned} chủ đề, chủ đề còn lại tính 0 điểm.")
    if FLAG_NO_TRANSCRIPT in grading["flags"]:
        parts.append("Có câu không có văn bản chuyển từ giọng nói nên chưa chấm được, cần nghe video.")
    other = [f for f in grading["flags"] if f != FLAG_NO_TRANSCRIPT]
    if other:
        parts.append(f"Có cờ cần kiểm tra: {', '.join(other)}.")
    scored = [a for a in answers if a["transcript"].strip()]
    if scored:
        best, worst = max(scored, key=lambda a: a["score"]), min(scored, key=lambda a: a["score"])
        parts.append(f"Trả lời tốt nhất ở chủ đề «{best['topic']}», yếu nhất ở «{worst['topic']}».")
    return " ".join(parts)


def retry_at(at: datetime) -> datetime:
    return at + timedelta(days=RETAKE_DAYS)


def duration_label(seconds: int) -> str:
    minutes, rest = divmod(max(0, seconds), 60)
    return f"{minutes} phút {rest} giây" if minutes else f"{rest} giây"
