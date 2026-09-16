"""AI Interview (FR-7.2 → FR-7.4) — engine không lưu trạng thái; lịch sử do mentoring-service gửi kèm."""
from fastapi import APIRouter, Depends

from app import engines
from app.interview import deepseek_engine, rule_based
from app.interview.models import FinalAssessment, InterviewContext, QuestionPlan, TurnEvaluation, TurnRecord
from app.llm.deepseek import get_client
from app.schemas import CamelModel
from app.security import require_internal

router = APIRouter(prefix="/internal/interview", dependencies=[Depends(require_internal)])


class EngineInfo(CamelModel):
    engine: str
    fallback_used: bool = False


class FirstQuestionRequest(CamelModel):
    context: InterviewContext
    engine: str | None = None


class QuestionResponse(QuestionPlan, EngineInfo):
    pass


class EvaluateRequest(CamelModel):
    context: InterviewContext
    history: list[TurnRecord] = []
    current: TurnRecord
    is_last_turn: bool
    engine: str | None = None


class EvaluationResponse(TurnEvaluation, EngineInfo):
    pass


class SummarizeRequest(CamelModel):
    context: InterviewContext
    turns: list[TurnRecord]
    engine: str | None = None


class AssessmentResponse(FinalAssessment, EngineInfo):
    pass


@router.post("/first-question", response_model=QuestionResponse, response_model_by_alias=True)
def first_question(req: FirstQuestionRequest) -> QuestionResponse:
    engine = engines.select(req.engine)
    if engine == engines.DEEPSEEK:
        plan, fallback = deepseek_engine.first_question(get_client(), req.context)
    else:
        plan, fallback = rule_based.first_question(req.context), False
    return QuestionResponse(**plan.model_dump(), engine=engine, fallback_used=fallback)


@router.post("/evaluate", response_model=EvaluationResponse, response_model_by_alias=True)
def evaluate(req: EvaluateRequest) -> EvaluationResponse:
    engine = engines.select(req.engine)
    if engine == engines.DEEPSEEK:
        result, fallback = deepseek_engine.evaluate(get_client(), req.context, req.history, req.current, req.is_last_turn)
    else:
        result, fallback = rule_based.evaluate(req.context, req.history, req.current, req.is_last_turn), False
    return EvaluationResponse(**result.model_dump(), engine=engine, fallback_used=fallback)


@router.post("/summarize", response_model=AssessmentResponse, response_model_by_alias=True)
def summarize(req: SummarizeRequest) -> AssessmentResponse:
    engine = engines.select(req.engine)
    if engine == engines.DEEPSEEK:
        result, fallback = deepseek_engine.summarize(get_client(), req.context, req.turns)
    else:
        result, fallback = rule_based.summarize(req.context, req.turns), False
    return AssessmentResponse(**result.model_dump(), engine=engine, fallback_used=fallback)
