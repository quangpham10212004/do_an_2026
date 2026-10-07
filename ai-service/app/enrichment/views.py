"""Response model của CV Parsing + Chatbot enrichment (JSON camelCase)."""
from datetime import datetime
from uuid import UUID

import asyncpg
from pydantic import Field

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


class EnrichmentMessageView(CamelModel):
    turn_no: int
    slot: str
    slot_label: str
    question: str
    answer: str | None = None


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
    enriched_goal: str | None = None
    profile_synced: bool = False
    created_at: datetime
    completed_at: datetime | None = None


class CvUploadResult(CamelModel):
    cv: CvView
    # US-20: null cho tới khi người dùng duyệt thông tin CV và bắt đầu chatbot
    conversation: ConversationView | None = None


class AnswerInput(CamelModel):
    answer: str = Field(min_length=1, max_length=5000)


def cv_view(cv: asyncpg.Record) -> CvView:
    return CvView(id=cv["id"], file_name=cv["file_name"], engine=cv["engine"], parsed=parsed_of(cv),
                  consent_external_ai=cv["consent_external_ai"], confirmed_fields=confirmed_of(cv),
                  confirmed_at=cv["confirmed_at"], created_at=cv["created_at"])


def conversation_view(conversation: asyncpg.Record, messages: list[asyncpg.Record]) -> ConversationView:
    views = [EnrichmentMessageView(turn_no=m["turn_no"], slot=m["slot"],
                                   slot_label=SLOT_LABELS.get(m["slot"], "Khác"),
                                   question=m["question"], answer=m["answer"]) for m in messages]
    in_progress = conversation["status"] == "IN_PROGRESS"
    current = next((m for m in views if m.answer is None), None) if in_progress else None
    return ConversationView(
        id=conversation["id"], mentee_id=conversation["mentee_id"], cv_id=conversation["cv_id"],
        status=conversation["status"], engine=conversation["engine"], max_turns=conversation["max_turns"],
        current_turn=conversation["current_turn"], current_question=current, messages=views,
        enriched_goal=conversation["enriched_goal"], profile_synced=conversation["profile_synced"],
        created_at=conversation["created_at"], completed_at=conversation["completed_at"])
