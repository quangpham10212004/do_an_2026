"""Response model của CV Parsing + Chatbot enrichment (JSON camelCase)."""
from datetime import datetime
from typing import Annotated
from uuid import UUID

import asyncpg
from pydantic import Field, StringConstraints

from app.cv.models import ConfirmedFields, ParsedCv
from app.cv.repository import confirmed_of, parsed_of
from app.enrichment.models import SLOT_LABELS
from app.schemas import CamelModel


class CvView(CamelModel):
    id: UUID
    file_name: str
    engine: str
    parsed: ParsedCv
    consent_external_ai: bool
    # US-20: null = người dùng chưa duyệt kết quả parse (chatbot chưa bắt đầu)
    confirmed_fields: ConfirmedFields | None = None
    confirmed_at: datetime | None = None
    created_at: datetime


class CvSummaryView(CamelModel):
    """Một dòng trong GET /api/ai/cv/mine."""
    id: UUID
    file_name: str
    uploaded_at: datetime
    file_url: str
    consent_external_ai: bool
    # US-45 (PRD-CV-6): file + văn bản gốc bị xoá 12 tháng sau khi tải lên (purged_at); delete_after = hạn đó
    purged_at: datetime | None = None
    delete_after: datetime | None = None
    # Kỹ năng đã thêm vào hồ sơ từ CV này (xoá CV có thể gỡ kèm)
    added_skills: list[str] = []


class EnrichmentMessageView(CamelModel):
    turn_no: int
    slot: str
    slot_label: str
    question: str
    answer: str | None = None
    # US-45 (PRD-CV-3): mentee bấm "Bỏ qua"
    skipped: bool = False


class ConversationView(CamelModel):
    id: UUID
    mentee_id: UUID
    cv_id: UUID
    status: str
    engine: str
    max_turns: int
    current_turn: int
    current_question: EnrichmentMessageView | None = None
    messages: list[EnrichmentMessageView] = []
    enriched_goal: str | None = None  # bản nháp do chatbot tổng hợp
    # US-21: NONE | DRAFT | CONFIRMED | DISCARDED — hồ sơ chỉ đổi khi CONFIRMED
    goal_status: str = "NONE"
    confirmed_goal: str | None = None
    goal_decided_at: datetime | None = None
    profile_synced: bool = False
    created_at: datetime
    completed_at: datetime | None = None
    # US-45 (PRD-CV-5): kỹ năng trích từ CV (đã duyệt) hiển thị dạng chip gợi ý; added_skills = những kỹ năng mentee
    # đã chọn thêm vào hồ sơ khi xác nhận mục tiêu
    suggested_skills: list[str] = []
    added_skills: list[str] = []


class CvUploadResult(CamelModel):
    cv: CvView
    # US-20: null cho tới khi người dùng duyệt thông tin CV và bắt đầu chatbot
    conversation: ConversationView | None = None


class AnswerInput(CamelModel):
    """answer bắt buộc trừ khi skipped = true (US-45, PRD-CV-3 nút "Bỏ qua")."""
    answer: str = Field(default="", max_length=5000)
    skipped: bool = False


class GoalInput(CamelModel):
    """US-21 — goal người dùng chọn dùng (có thể đã sửa từ bản nháp); giới hạn theo profile-service (3000).
    skills (US-45, PRD-CV-5): kỹ năng gợi ý từ CV mà mentee chọn thêm vào hồ sơ; None = tất cả kỹ năng đã duyệt
    (hành vi trước US-45), [] = không thêm kỹ năng nào."""
    goal: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=3000)]
    skills: list[str] | None = Field(default=None, max_length=30)


def cv_view(cv: asyncpg.Record) -> CvView:
    return CvView(id=cv["id"], file_name=cv["file_name"], engine=cv["engine"], parsed=parsed_of(cv),
                  consent_external_ai=cv["consent_external_ai"], confirmed_fields=confirmed_of(cv),
                  confirmed_at=cv["confirmed_at"], created_at=cv["created_at"])


def conversation_view(conversation: asyncpg.Record, messages: list[asyncpg.Record],
                      cv: asyncpg.Record | None = None) -> ConversationView:
    """cv (tuỳ chọn) — để trả kỹ năng gợi ý từ CV (US-45): kỹ năng đã duyệt ở bước xem lại thông tin CV."""
    views = [EnrichmentMessageView(turn_no=m["turn_no"], slot=m["slot"],
                                   slot_label=SLOT_LABELS.get(m["slot"], "Khác"),
                                   question=m["question"], answer=m["answer"],
                                   skipped=bool(m.get("skipped", False))) for m in messages]
    confirmed = confirmed_of(cv) if cv is not None else None
    in_progress = conversation["status"] == "IN_PROGRESS"
    current = next((m for m in views if m.answer is None), None) if in_progress else None
    return ConversationView(
        id=conversation["id"], mentee_id=conversation["mentee_id"], cv_id=conversation["cv_id"],
        status=conversation["status"], engine=conversation["engine"], max_turns=conversation["max_turns"],
        current_turn=conversation["current_turn"], current_question=current, messages=views,
        enriched_goal=conversation["enriched_goal"], goal_status=conversation["goal_status"],
        confirmed_goal=conversation["confirmed_goal"], goal_decided_at=conversation["goal_decided_at"],
        profile_synced=conversation["profile_synced"],
        created_at=conversation["created_at"], completed_at=conversation["completed_at"],
        suggested_skills=[] if confirmed is None else list(confirmed.skills),
        added_skills=list(conversation["added_skills"] or []))
