"""Request / response model của buổi luyện phỏng vấn với AI (FR-10.x, JSON camelCase — CONVENTIONS.md mục 3)."""
from datetime import datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

import asyncpg
from pydantic import StringConstraints, field_validator

from app import config
from app.interview.voice import VoiceSessionView
from app.practice import repository as repo
from app.practice.models import PracticeResult
from app.schemas import CamelModel

InterviewType = Literal["BACKEND", "FRONTEND", "SYSTEM_DESIGN", "BEHAVIORAL"]
Level = Literal["INTERN", "FRESHER", "JUNIOR"]


class StartPracticeInput(CamelModel):
    """Intake trước buổi luyện: dạng phỏng vấn, cấp độ, vị trí (2–120 ký tự), công ty (tuỳ chọn, ≤ 120), đồng ý OpenAI xử lý âm thanh."""
    interview_type: InterviewType
    level: Level
    target_role: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    target_company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    consent_external_ai: bool = False

    @field_validator("target_company")
    @classmethod
    def _blank_is_none(cls, v: str | None) -> str | None:
        return v or None


class PracticeEligibilityView(CamelModel):
    free_limit: int
    used: int
    can_start: bool
    # null | PRACTICE_FREE_USED (đã dùng lượt miễn phí) | IN_PROGRESS (đang có buổi < 30 phút — bắt đầu = kết nối lại)
    reason: str | None = None
    in_progress_id: UUID | None = None
    voice_available: bool = False


class PracticeView(CamelModel):
    id: UUID
    mentee_id: UUID
    interview_type: InterviewType
    level: Level
    target_role: str
    target_company: str | None = None
    status: str
    topics: list[str] = []
    engine: str
    consent_external_ai: bool = False
    overall_score: float | None = None
    # Có khi COMPLETED: điểm, rubric và nhận xét từng câu, 3 điểm mạnh, 3 việc cần cải thiện, báo cáo cách nói
    result: PracticeResult | None = None
    created_at: datetime
    completed_at: datetime | None = None
    # IN_PROGRESS: kết nối lại được tới mốc này (bắt đầu + VOICE_SESSION_MINUTES); quá hạn => ABANDONED
    resume_deadline: datetime | None = None


class PracticeStart(CamelModel):
    """voice = null khi chưa cấu hình OPENAI_API_KEY (chỉ ngoài prod)."""
    practice: PracticeView
    voice: VoiceSessionView | None = None


def practice_view(row: asyncpg.Record) -> PracticeView:
    result = repo.load_json(row["result"])
    in_progress = row["status"] == "IN_PROGRESS"
    return PracticeView(
        id=row["id"], mentee_id=row["mentee_id"], interview_type=row["interview_type"], level=row["level"],
        target_role=row["target_role"], target_company=row["target_company"], status=row["status"],
        topics=list(row["topics"] or []), engine=row["engine"], consent_external_ai=row["consent_external_ai"],
        overall_score=None if row["overall_score"] is None else round(row["overall_score"], 1),
        result=None if result is None else PracticeResult.model_validate(result),
        created_at=row["created_at"], completed_at=row["completed_at"],
        resume_deadline=row["created_at"] + timedelta(minutes=config.VOICE_SESSION_MINUTES) if in_progress else None)
