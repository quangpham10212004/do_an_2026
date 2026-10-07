"""
Façade chọn engine cho chatbot enrichment: DeepSeek khi có API key VÀ CV có đồng ý gửi AI bên ngoài
(US-19 — kiểm tra lại ở MỖI lượt), ngược lại rule-based; DeepSeek lỗi => fallback rule-based.
"""
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from app import engines
from app.cv.engine import engine_for
from app.enrichment import deepseek_engine, rule_based
from app.enrichment.models import Exchange, MenteeContext, NextQuestion
from app.llm.deepseek import get_client


@dataclass(frozen=True)
class QuestionResult:
    question: NextQuestion
    engine: str
    fallback_used: bool


@dataclass(frozen=True)
class GoalResult:
    enriched_goal: str
    engine: str
    fallback_used: bool


def _next_question(engine: str, ctx: MenteeContext, history: list[Exchange]) -> QuestionResult:
    if engine == engines.DEEPSEEK:
        question, fallback = deepseek_engine.next_question(get_client(), ctx, history)
    else:
        question, fallback = rule_based.next_question(ctx, history), False
    return QuestionResult(question=question, engine=engine, fallback_used=fallback)


def _summarize_goal(engine: str, ctx: MenteeContext, history: list[Exchange]) -> GoalResult:
    if engine == engines.DEEPSEEK:
        goal, fallback = deepseek_engine.summarize_goal(get_client(), ctx, history)
    else:
        goal, fallback = rule_based.summarize_goal(ctx, history), False
    return GoalResult(enriched_goal=goal, engine=engine, fallback_used=fallback)


async def next_question(preferred: str | None, ctx: MenteeContext, history: list[Exchange],
                        allow_external: bool) -> QuestionResult:
    return await run_in_threadpool(_next_question, engine_for(preferred, allow_external), ctx, history)


async def summarize_goal(preferred: str | None, ctx: MenteeContext, history: list[Exchange],
                         allow_external: bool) -> GoalResult:
    return await run_in_threadpool(_summarize_goal, engine_for(preferred, allow_external), ctx, history)
