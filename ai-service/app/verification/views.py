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


class SlotView(CamelModel):
    id: UUID
    starts_at: datetime
    status: str  # PROPOSED | CHOSEN | EXPIRED


class ProposeSlotsInput(CamelModel):
    """Admin đề xuất khung giờ vòng 2 — chỉ có giờ bắt đầu (D8: không giới hạn thời lượng)."""
    starts_at: list[datetime] = Field(min_length=1, max_length=10)


class Round2Schedule(CamelModel):
    """Buổi vòng 2 đã chốt giờ (mentor thấy): lúc nào, phòng mở khi nào, còn đổi giờ được không."""
    interview_id: UUID
    scheduled_at: datetime
    room_opens_at: datetime
    can_reschedule: bool
    reschedule_blocked_reason: str | None = None  # RESCHEDULE_LIMIT | RESCHEDULE_TOO_LATE


class ComparisonRow(CamelModel):
    criterion: str
    ai: float
    admin: float
    delta: float
    large: bool  # chênh >= 4 điểm: thông tin để admin xem lại, không tự chặn


class Round2InterviewView(CamelModel):
    id: UUID
    scheduled_at: datetime
    status: str  # SCHEDULED | COMPLETED | MENTOR_NO_SHOW | RESCHEDULED
    mentor_joined_at: datetime | None = None
    admin_joined_at: datetime | None = None
    ended_at: datetime | None = None
    scores: dict[str, float] | None = None
    score_notes: dict[str, str] | None = None
    total_score: float | None = None
    recommendation: str | None = None
    blocked: bool = False  # điều kiện chặn: technical / authenticity <= 2
    note: str | None = None
    comparison: list[ComparisonRow] = []


class Round2DecisionInput(CamelModel):
    """Kết luận sau vòng 2: APPROVE | REJECT (kèm phiếu chấm đủ 5 tiêu chí) | RESCHEDULE (không cần phiếu)."""
    decision: str = Field(pattern="^(APPROVE|REJECT|RESCHEDULE)$")
    scores: dict[str, float] | None = None
    score_notes: dict[str, str] | None = None
    note: str | None = Field(default=None, max_length=2000)


class RoomView(CamelModel):
    provider: str
    domain: str
    room_name: str
    jwt: str
    opens_at: datetime
    expires_at: datetime
    moderator: bool


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
    # Vòng 2: khung giờ admin đề xuất (ROUND2_PENDING_CHOICE), hạn chọn, buổi đã chốt, số lần đổi giờ
    slots: list[SlotView] = []
    choice_deadline: datetime | None = None
    reschedule_count: int = 0
    reschedule_limit: int = 2
    round2: Round2Schedule | None = None


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
    # Vòng 2 (chi tiết admin): khung giờ, các buổi (kèm phiếu chấm và so sánh với điểm AI), bộ đếm
    reschedule_count: int = 0
    no_show_count: int = 0
    choice_deadline: datetime | None = None
    slots: list[SlotView] = []
    round2_interviews: list[Round2InterviewView] = []
    warnings: list[str] = []
