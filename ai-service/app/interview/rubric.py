"""
Rubric chấm AI Interview (PRD 6.1, US-23) — MỘT nơi duy nhất tính điểm cho cả hai engine.

| Tiêu chí              | Trọng số | 0–2                      | 3–6                       | 7–10                                          |
|-----------------------|----------|--------------------------|---------------------------|-----------------------------------------------|
| technical (kỹ thuật)  | 40%      | Sai hoặc lạc đề          | Đúng nhưng chung chung    | Đúng, nêu được đánh đổi và giới hạn           |
| depth (kinh nghiệm)   | 30%      | Không có ví dụ cụ thể    | Một ví dụ, ít chi tiết    | Dự án thực tế, số liệu, giải thích quyết định |
| communication         | 15%      | Khó theo dõi             | Dễ hiểu                   | Có cấu trúc, phù hợp người mới                |
| mentoring             | 15%      | Không có góc nhìn hướng dẫn | Có một số chỉ dẫn      | Kế hoạch rõ để dạy / gỡ vướng cho mentee      |

- Điểm câu = tổng có trọng số (0–10); điểm tổng = trung bình điểm câu × 10 (0–100).
- Khuyến nghị: ≥ 70 APPROVE, 50–69 NEEDS_REVIEW, < 50 REJECT; có lượt bị gắn cờ (prompt injection /
  câu trả lời dán vào) ⇒ NEEDS_REVIEW bất kể điểm.
"""
import math
import re

from pydantic import Field

from app.schemas import CamelModel

WEIGHTS: dict[str, float] = {"technical": 0.40, "depth": 0.30, "communication": 0.15, "mentoring": 0.15}
APPROVE_THRESHOLD = 70.0
REJECT_THRESHOLD = 50.0  # < 50 => REJECT

FLAG_PROMPT_INJECTION = "PROMPT_INJECTION"
FLAG_COPIED_ANSWER = "COPIED_ANSWER"
REVIEW_FLAGS = (FLAG_PROMPT_INJECTION, FLAG_COPIED_ANSWER)

# Câu trả lời chứa mệnh lệnh cho người chấm (PRD-AIV-6) — chấm bằng rule-based và gắn cờ.
_INJECTION = re.compile(
    r"(cho\s+(tôi|em|mình|toi|minh)\s+\d+(/10)?\s*điểm|chấm\s+(cho\s+)?(tôi|em|mình)?\s*(\d+\s*điểm|điểm\s+(tối\s+đa|cao\s+nhất|10))"
    r"|điểm\s+tuyệt\s+đối|give\s+(me|this(\s+answer)?)\s+(a\s+)?(\d+|full|max(imum)?|perfect)\b"
    r"|score\s+(me|this(\s+answer)?)\s+(as\s+)?(\d+|full|max(imum)?|high(ly)?)"
    r"|full\s+(marks|score)|ignore\s+(all\s+|the\s+|any\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)"
    r"|bỏ\s+qua\s+(mọi\s+|tất\s+cả\s+|các\s+)?(hướng\s+dẫn|chỉ\s+dẫn|yêu\s+cầu|quy\s+tắc)"
    r"|system\s+prompt|you\s+are\s+now|bạn\s+(bây\s+giờ\s+)?là\s+người\s+chấm\s+dễ\s+tính)",
    re.IGNORECASE)


class RubricScores(CamelModel):
    """Điểm 4 tiêu chí của một câu trả lời, mỗi tiêu chí 0–10."""
    technical: float = Field(ge=0, le=10)
    depth: float = Field(ge=0, le=10)
    communication: float = Field(ge=0, le=10)
    mentoring: float = Field(ge=0, le=10)


def round1(x: float) -> float:
    """Làm tròn 1 chữ số thập phân kiểu half-up (tránh làm tròn ngân hàng của Python)."""
    return math.floor(x * 10 + 0.5 + 1e-9) / 10


def turn_score(r: RubricScores) -> float:
    """Điểm câu (0–10) = Σ trọng số × điểm tiêu chí."""
    return round1(sum(WEIGHTS[k] * getattr(r, k) for k in WEIGHTS))


def overall_score(turn_scores: list[float]) -> float:
    """Điểm tổng (0–100) = trung bình điểm câu × 10; chưa có lượt nào => 0."""
    if not turn_scores:
        return 0.0
    return round1(sum(turn_scores) / len(turn_scores) * 10)


def is_flagged(flags: list[str] | None) -> bool:
    return any(f in REVIEW_FLAGS for f in (flags or []))


def recommend(overall: float, flagged: bool) -> str:
    if flagged:
        return "NEEDS_REVIEW"
    if overall >= APPROVE_THRESHOLD:
        return "APPROVE"
    if overall < REJECT_THRESHOLD:
        return "REJECT"
    return "NEEDS_REVIEW"


def detect_injection(answer: str | None) -> bool:
    return bool(_INJECTION.search(answer or ""))


def note_required(decision: str, recommendation: str | None) -> bool:
    """
    Admin phải ghi chú (≥ 10 ký tự) khi quyết định NGƯỢC khuyến nghị AI (PRD-AIV-9):
    - APPROVE khi AI khuyến nghị REJECT; REJECT khi AI khuyến nghị APPROVE;
    - REQUEST_RETAKE khi AI khuyến nghị APPROVE hoặc REJECT (khác cả hai);
    - AI khuyến nghị NEEDS_REVIEW (hoặc buổi cũ không có khuyến nghị) => không bắt buộc với mọi quyết định.
    """
    if recommendation not in ("APPROVE", "REJECT"):
        return False
    if decision == "REQUEST_RETAKE":
        return True
    return decision != recommendation


def agrees(decision: str, recommendation: str | None) -> bool | None:
    """
    Chỉ số online (US-24): quyết định admin có trùng khuyến nghị AI không. None = không tính vào tỉ lệ
    (AI khuyến nghị NEEDS_REVIEW / không có khuyến nghị — AI không đưa ra hướng nào để đồng ý hay phản đối).
    REQUEST_RETAKE so với APPROVE/REJECT được tính là KHÔNG đồng ý.
    """
    if recommendation not in ("APPROVE", "REJECT"):
        return None
    return decision == recommendation
