from typing import Literal

from app.schemas import CamelModel

Strategy = Literal["OPENING", "DEEPEN", "PIVOT"]
Recommendation = Literal["APPROVE", "REJECT", "NEEDS_REVIEW"]


class InterviewContext(CamelModel):
    """Thông tin mentor dùng để cá nhân hoá câu hỏi."""
    domain: str
    skills: list[str] = []
    years_experience: int = 0
    bio: str | None = None
    max_turns: int = 5


class TurnRecord(CamelModel):
    """1 lượt hỏi-đáp (đưa vào engine làm lịch sử hội thoại)."""
    turn_no: int
    topic: str
    strategy: Strategy
    question: str
    answer: str | None = None
    score: float | None = None


class QuestionPlan(CamelModel):
    topic: str
    strategy: Strategy
    question: str


class TurnEvaluation(CamelModel):
    """Chấm 1 câu trả lời (0-10) kèm nhận xét và câu hỏi tiếp theo nếu còn lượt."""
    score: float
    feedback: str
    next: QuestionPlan | None = None


class FinalAssessment(CamelModel):
    """Đánh giá tổng hợp sau lượt cuối (FR-7.4). overall_score thang 0-100."""
    overall_score: float
    summary: str
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendation: Recommendation
