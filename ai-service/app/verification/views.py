"""Response model của đợt xác thực mentor (JSON camelCase — CONVENTIONS.md mục 3)."""
from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.interview.views import InterviewView
from app.schemas import CamelModel


class Round1ReviewInput(CamelModel):
    """Admin duyệt vòng 1 (docs/design-mentor-verification.md §7): PASS | REJECT | RETAKE (kèm ghi chú)."""
    decision: str = Field(pattern="^(PASS|REJECT|RETAKE)$")
    note: str | None = Field(default=None, max_length=2000)


class VerificationStatusView(CamelModel):
    """GET /api/ai/verification/status — mentor thấy mình đang ở đâu, còn mấy lần, bao giờ được làm lại."""
    application_id: UUID | None = None
    status: str | None = None
    attempts_used: int = 0
    attempts_left: int
    max_attempts: int
    retake_count: int = 0
    retake_limit: int
    retry_after: datetime | None = None
    can_start: bool
    # IN_PROGRESS | PENDING_REVIEW | ALREADY_APPROVED | COOLDOWN | null
    reason: str | None = None
    # Server có OPENAI_API_KEY (vòng 1 dùng được)
    voice_available: bool = False


class ApplicationView(CamelModel):
    id: UUID
    mentor_id: UUID
    mentor_name: str | None = None
    status: str
    attempts_used: int
    attempts_left: int
    max_attempts: int
    retake_count: int
    retake_limit: int
    round1_decision: str | None = None
    round1_note: str | None = None
    round1_reviewed_at: datetime | None = None
    reviewed_at: datetime | None = None
    closed_at: datetime | None = None
    retry_after: datetime | None = None
    created_at: datetime
    # Buổi vòng 1 mới nhất (điểm, khuyến nghị, cờ, bản chép lời); chi tiết admin có thêm toàn bộ các lần làm
    interview: InterviewView | None = None
    interviews: list[InterviewView] = []
