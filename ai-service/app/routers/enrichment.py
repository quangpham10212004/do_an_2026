"""Chatbot enrichment (FR-8.3, FR-8.4) — không lưu trạng thái; lịch sử hội thoại do mentoring-service gửi kèm."""
from fastapi import APIRouter, Depends

from app import engines
from app.enrichment import deepseek_engine, rule_based
from app.enrichment.models import SLOT_LABELS, Exchange, MenteeContext
from app.llm.deepseek import get_client
from app.schemas import CamelModel
from app.security import require_internal

router = APIRouter(prefix="/internal/enrichment", dependencies=[Depends(require_internal)])


class EnrichmentRequest(CamelModel):
    context: MenteeContext
    history: list[Exchange] = []
    engine: str | None = None


class NextQuestionResponse(CamelModel):
    slot: str
    slot_label: str
    question: str
    engine: str
    fallback_used: bool = False


class GoalResponse(CamelModel):
    enriched_goal: str
    engine: str
    fallback_used: bool = False


@router.post("/next-question", response_model=NextQuestionResponse, response_model_by_alias=True)
def next_question(req: EnrichmentRequest) -> NextQuestionResponse:
    engine = engines.select(req.engine)
    if engine == engines.DEEPSEEK:
        q, fallback = deepseek_engine.next_question(get_client(), req.context, req.history)
    else:
        q, fallback = rule_based.next_question(req.context, req.history), False
    return NextQuestionResponse(slot=q.slot, slot_label=SLOT_LABELS[q.slot], question=q.question, engine=engine,
                                fallback_used=fallback)


@router.post("/summarize", response_model=GoalResponse, response_model_by_alias=True)
def summarize(req: EnrichmentRequest) -> GoalResponse:
    engine = engines.select(req.engine)
    if engine == engines.DEEPSEEK:
        goal, fallback = deepseek_engine.summarize_goal(get_client(), req.context, req.history)
    else:
        goal, fallback = rule_based.summarize_goal(req.context, req.history), False
    return GoalResponse(enriched_goal=goal, engine=engine, fallback_used=fallback)
