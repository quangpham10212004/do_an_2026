"""Response model của AI Interview (JSON camelCase — CONVENTIONS.md mục 3)."""
from datetime import datetime
from uuid import UUID

import asyncpg
from pydantic import Field

from app.interview.models import Recommendation, Strategy
from app.interview.rubric import RubricScores, is_flagged
from app.schemas import CamelModel


class InterviewTurnView(CamelModel):
    turn_no: int
    topic: str
    strategy: Strategy
    question: str
    answer: str | None = None
    score: float | None = None
    feedback: str | None = None
    # US-23: điểm 4 tiêu chí (null với lượt trước Sprint 3 hoặc khi điểm đang bị ẩn với mentor)
    rubric: RubricScores | None = None
    flags: list[str] = []
    # PRD-AIV-7 (chỉ admin): engine thực sự chấm lượt này, model, phiên bản prompt, có fallback không
    engine: str | None = None
    model: str | None = None
    prompt_version: str | None = None
    fallback_used: bool | None = None
    # PRD-AIV-2: thời gian trả lời (giây) từ lúc câu hỏi được đưa ra
    duration_seconds: int | None = None
    asked_at: datetime
    answered_at: datetime | None = None


class InterviewView(CamelModel):
    id: UUID
    mentor_id: UUID
    mentor_name: str | None = None
    domain: str
    skills: list[str] = []
    status: str
    engine: str
    max_turns: int
    current_turn: int
    current_question: InterviewTurnView | None = None
    turns: list[InterviewTurnView] = []
    overall_score: float | None = None
    summary: str | None = None
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendation: Recommendation | None = None
    review_note: str | None = None
    # US-23: có lượt bị gắn cờ (PROMPT_INJECTION / COPIED_ANSWER) — chỉ admin
    flagged: bool = False
    self_answer_acknowledged: bool = False
    created_at: datetime
    completed_at: datetime | None = None
    reviewed_at: datetime | None = None


class StartInterviewInput(CamelModel):
    """US-22 (PRD-AIV-1): bắt buộc xác nhận "Tôi tự trả lời, không có sự trợ giúp từ bên ngoài"."""
    self_answer_acknowledged: bool = False


class EligibilityView(CamelModel):
    """US-22 (PRD-AIV-4): số lần đã dùng / còn lại, thời điểm hết thời gian chờ, bị khoá hay không."""
    attempts_used: int
    attempts_left: int
    max_attempts: int
    cooldown_until: datetime | None = None
    locked: bool
    can_start: bool
    reason: str | None = None
    question_count: int = 5


class UnlockInput(CamelModel):
    note: str | None = Field(default=None, max_length=2000)


class AnswerInput(CamelModel):
    answer: str = Field(min_length=1, max_length=5000)
    # PRD-AIV-2: trình duyệt phát hiện dán > 500 ký tự trong một lần => gắn cờ COPIED_ANSWER (không chặn)
    pasted_large_text: bool = False


class ReviewInterviewInput(CamelModel):
    decision: str = Field(pattern="^(APPROVE|REJECT|REQUEST_RETAKE)$")
    note: str | None = Field(default=None, max_length=2000)


class InterviewStats(CamelModel):
    interviews_in_progress: int = 0
    interviews_pending_review: int = 0
    mentors_approved: int = 0
    mentors_rejected: int = 0


def _split(text: str | None) -> list[str]:
    return [line for line in (text or "").split("\n") if line.strip()]


def _r1(v: float | None) -> float | None:
    """Cột REAL (float4) => làm tròn 1 chữ số để JSON không ra 7.800000190734863."""
    return None if v is None else round(v, 1)


def _rubric(turn: asyncpg.Record) -> RubricScores | None:
    values = {k: _r1(turn["score_" + k]) for k in ("technical", "depth", "communication", "mentoring")}
    return None if any(v is None for v in values.values()) else RubricScores(**values)


def turn_view(turn: asyncpg.Record, reveal_scores: bool, for_admin: bool = False) -> InterviewTurnView:
    answered = turn["answered_at"]
    return InterviewTurnView(
        turn_no=turn["turn_no"], topic=turn["topic"], strategy=turn["strategy"], question=turn["question"],
        answer=turn["answer"], score=_r1(turn["score"]) if reveal_scores else None,
        feedback=turn["feedback"] if reveal_scores else None,
        rubric=_rubric(turn) if reveal_scores else None,
        flags=list(turn["flags"] or []) if for_admin else [],
        engine=turn["engine"] if for_admin else None, model=turn["model"] if for_admin else None,
        prompt_version=turn["prompt_version"] if for_admin else None,
        fallback_used=turn["fallback_used"] if for_admin else None,
        duration_seconds=None if answered is None else int((answered - turn["asked_at"]).total_seconds()),
        asked_at=turn["asked_at"], answered_at=answered)


def interview_view(interview: asyncpg.Record, turns: list[asyncpg.Record], for_admin: bool,
                   mentor_name: str | None = None) -> InterviewView:
    """
    Trong lúc phỏng vấn, mentor KHÔNG thấy điểm/nhận xét từng câu (tránh "học tủ"
    theo phản hồi). Sau khi hoàn thành, mentor và admin xem được toàn bộ.
    """
    in_progress = interview["status"] == "IN_PROGRESS"
    reveal = for_admin or not in_progress
    turn_views = [turn_view(t, reveal, for_admin) for t in turns]
    current = next((t for t in turn_views if t.answer is None), None) if in_progress else None
    return InterviewView(
        id=interview["id"], mentor_id=interview["mentor_id"], mentor_name=mentor_name, domain=interview["domain"],
        skills=list(interview["skills"] or []), status=interview["status"], engine=interview["engine"],
        max_turns=interview["max_turns"], current_turn=interview["current_turn"], current_question=current,
        turns=turn_views, overall_score=_r1(interview["overall_score"]), summary=interview["summary"],
        strengths=_split(interview["strengths"]), weaknesses=_split(interview["weaknesses"]),
        recommendation=interview["recommendation"], review_note=interview["review_note"],
        flagged=for_admin and any(is_flagged(list(t["flags"] or [])) for t in turns),
        self_answer_acknowledged=interview["self_answer_acknowledged"],
        created_at=interview["created_at"], completed_at=interview["completed_at"],
        reviewed_at=interview["reviewed_at"])
