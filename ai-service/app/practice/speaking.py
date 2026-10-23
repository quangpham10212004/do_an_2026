"""
FR-10.x — báo cáo cách nói của mentee (hàm thuần): số từ đệm, số từ trung bình mỗi câu trả lời, số câu trả lời dưới 20 từ.
Đếm trên bản chép lời (OpenAI transcription), chữ thường CÓ dấu — "à" bỏ dấu sẽ trùng với "a" nên không bỏ dấu ở đây.
"""
import re
import unicodedata

from app.schemas import CamelModel

FILLERS = ("ừm", "à", "ờ", "uh", "um", "kiểu như", "thì là")
SHORT_ANSWER_WORDS = 20

# Cho phép kéo dài âm ("ừmm", "uhh", "ờờ"); ranh giới là ký tự không phải chữ/số (\w hiểu chữ tiếng Việt).
_PATTERNS = {
    "ừm": r"ừ+m+", "à": r"à+", "ờ": r"ờ+", "uh": r"u+h+", "um": r"u+m+",
    "kiểu như": r"kiểu\s+như", "thì là": r"thì\s+là",
}
_FILLER = {k: re.compile(r"(?<!\w)" + v + r"(?!\w)", re.IGNORECASE) for k, v in _PATTERNS.items()}


class SpeakingReport(CamelModel):
    filler_count: int
    fillers: dict[str, int]
    answer_count: int
    avg_words_per_answer: float
    short_answers: int
    unanswered: int


def word_count(text: str | None) -> int:
    return len(re.findall(r"\w+", text or ""))


def filler_counts(text: str | None) -> dict[str, int]:
    lowered = unicodedata.normalize("NFC", text or "").lower()
    return {k: n for k, rx in _FILLER.items() if (n := len(rx.findall(lowered)))}


def report(answers: list[str]) -> SpeakingReport:
    """answers = câu trả lời theo từng chủ đề đã hỏi ("" = không trả lời)."""
    fillers: dict[str, int] = {}
    for a in answers:
        for k, n in filler_counts(a).items():
            fillers[k] = fillers.get(k, 0) + n
    words = [word_count(a) for a in answers if a.strip()]
    return SpeakingReport(
        filler_count=sum(fillers.values()), fillers=fillers, answer_count=len(words),
        avg_words_per_answer=round(sum(words) / len(words), 1) if words else 0.0,
        short_answers=sum(1 for w in words if w < SHORT_ANSWER_WORDS),
        unanswered=sum(1 for a in answers if not a.strip()))
