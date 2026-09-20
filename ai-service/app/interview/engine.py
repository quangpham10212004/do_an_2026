"""
Façade chọn engine cho AI Interview: DeepSeek khi có API key, ngược lại rule-based;
DeepSeek lỗi ở một lượt thì lượt đó tự chuyển sang rule-based (fallback).

Engine chạy đồng bộ (httpx blocking) nên được gọi trong threadpool để không chặn event loop.
"""
from dataclasses import dataclass
from typing import Generic, TypeVar

from starlette.concurrency import run_in_threadpool

from app import engines
from app.interview import deepseek_engine, rule_based
from app.interview.models import FinalAssessment, InterviewContext, QuestionPlan, TurnEvaluation, TurnRecord
from app.llm.deepseek import get_client

R = TypeVar("R")


@dataclass(frozen=True)
class EngineResult(Generic[R]):
    """Kết quả kèm engine thực sự đã dùng — lưu vào DB để cả buổi dùng nhất quán 1 engine."""
    value: R
    engine: str
    fallback_used: bool


def _first_question(engine: str, ctx: InterviewContext) -> EngineResult[QuestionPlan]:
    if engine == engines.DEEPSEEK:
        plan, fallback = deepseek_engine.first_question(get_client(), ctx)
    else:
        plan, fallback = rule_based.first_question(ctx), False
    return EngineResult(plan, engine, fallback)


def _evaluate(engine: str, ctx: InterviewContext, history: list[TurnRecord], current: TurnRecord,
              is_last_turn: bool) -> EngineResult[TurnEvaluation]:
    if engine == engines.DEEPSEEK:
        result, fallback = deepseek_engine.evaluate(get_client(), ctx, history, current, is_last_turn)
    else:
        result, fallback = rule_based.evaluate(ctx, history, current, is_last_turn), False
    return EngineResult(result, engine, fallback)


def _summarize(engine: str, ctx: InterviewContext, turns: list[TurnRecord]) -> EngineResult[FinalAssessment]:
    if engine == engines.DEEPSEEK:
        result, fallback = deepseek_engine.summarize(get_client(), ctx, turns)
    else:
        result, fallback = rule_based.summarize(ctx, turns), False
    return EngineResult(result, engine, fallback)


async def first_question(preferred: str | None, ctx: InterviewContext) -> EngineResult[QuestionPlan]:
    return await run_in_threadpool(_first_question, engines.select(preferred), ctx)


async def evaluate(preferred: str | None, ctx: InterviewContext, history: list[TurnRecord], current: TurnRecord,
                   is_last_turn: bool) -> EngineResult[TurnEvaluation]:
    return await run_in_threadpool(_evaluate, engines.select(preferred), ctx, history, current, is_last_turn)


async def summarize(preferred: str | None, ctx: InterviewContext,
                    turns: list[TurnRecord]) -> EngineResult[FinalAssessment]:
    return await run_in_threadpool(_summarize, engines.select(preferred), ctx, turns)
