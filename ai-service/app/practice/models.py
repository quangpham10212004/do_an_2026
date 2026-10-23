"""Mô hình dữ liệu chấm buổi luyện phỏng vấn của mentee (FR-10.x) — dùng chung cho hai engine và response."""
from app.practice.rubric import PracticeRubric
from app.practice.speaking import SpeakingReport
from app.schemas import CamelModel


class PracticeContext(CamelModel):
    """Thông tin mentee khai báo khi bắt đầu (intake), dùng để chấm theo đúng vị trí và cấp độ nhắm tới."""
    interview_type: str
    level: str
    target_role: str
    target_company: str | None = None
    # v2.1 — kế hoạch AI soạn: tên chủ đề → khái niệm kỳ vọng (rule-based chấm câu không có trong practice bank)
    planned_concepts: dict[str, list[str]] = {}


class PracticeAnswer(CamelModel):
    """1 chủ đề đã hỏi trong bản ghi giọng nói: câu hỏi (lời người phỏng vấn) và câu trả lời (lời mentee)."""
    topic_no: int
    topic: str
    question: str
    answer: str


class TurnGrade(CamelModel):
    topic_no: int
    topic: str
    question: str
    answer: str
    score: float
    rubric: PracticeRubric
    feedback: str
    flags: list[str] = []


class PracticeResult(CamelModel):
    """Kết quả hiện ngay cho mentee: điểm tổng 0–100, nhận xét từng câu, 3 điểm mạnh, 3 việc cần cải thiện, cách nói."""
    overall_score: float
    summary: str
    strengths: list[str]
    improvements: list[str]
    turns: list[TurnGrade]
    speaking: SpeakingReport
    engine: str
    model: str | None = None
    prompt_version: str
    fallback_used: bool = False
