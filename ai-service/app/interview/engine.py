"""
Façade chọn engine cho AI Interview: DeepSeek khi có API key, ngược lại rule-based;
DeepSeek lỗi ở một lượt thì lượt đó tự chuyển sang rule-based (fallback).

PRD-AIV-6: câu trả lời chứa mệnh lệnh cho người chấm ("cho tôi 10 điểm", "ignore previous instructions")
KHÔNG được gửi tới LLM — lượt đó chấm bằng rule-based và gắn cờ PROMPT_INJECTION.
PRD-AIV-7: mỗi lượt trả về engine thực sự đã chấm, model, phiên bản prompt và cờ fallback để lưu lại.

Engine chạy đồng bộ (httpx blocking) nên được gọi trong threadpool để không chặn event loop.
"""
from dataclasses import dataclass
from typing import Generic, TypeVar

from starlette.concurrency import run_in_threadpool

from app import config, engines
from app.interview import deepseek_engine, rubric, rule_based
from app.interview.models import FinalAssessment, InterviewContext, QuestionPlan, TurnEvaluation, TurnRecord
from app.llm.deepseek import get_client

R = TypeVar("R")


@dataclass(frozen=True)
class EngineResult(Generic[R]):
    """
    Kết quả kèm engine của BUỔI (lưu vào interviews.engine để cả buổi dùng nhất quán 1 engine) và thông tin
    tái lập của riêng kết quả này: engine thực sự đã chấm (RULE_BASED khi fallback), model, phiên bản prompt.
    """
    value: R
    engine: str
    fallback_used: bool
    used_engine: str = engines.RULE_BASED
    model: str | None = None
    prompt_version: str = rule_based.PROMPT_VERSION


def _result(value, engine: str, fallback: bool) -> EngineResult:
    if engine == engines.DEEPSEEK and not fallback:
        return EngineResult(value, engine, False, engines.DEEPSEEK, config.DEEPSEEK_MODEL, deepseek_engine.PROMPT_VERSION)
    return EngineResult(value, engine, fallback)


def _first_question(engine: str, ctx: InterviewContext) -> EngineResult[QuestionPlan]:
    if engine == engines.DEEPSEEK:
        plan, fallback = deepseek_engine.first_question(get_client(), ctx)
    else:
        plan, fallback = rule_based.first_question(ctx), False
    return _result(plan, engine, fallback)


def _evaluate(engine: str, ctx: InterviewContext, history: list[TurnRecord], current: TurnRecord,
              is_last_turn: bool) -> EngineResult[TurnEvaluation]:
    if rubric.detect_injection(current.answer):
        # rule_based.evaluate tự gắn cờ PROMPT_INJECTION; buổi DeepSeek => tính là fallback của lượt này.
        return _result(rule_based.evaluate(ctx, history, current, is_last_turn), engine, engine == engines.DEEPSEEK)
    if engine == engines.DEEPSEEK:
        result, fallback = deepseek_engine.evaluate(get_client(), ctx, history, current, is_last_turn)
    else:
        result, fallback = rule_based.evaluate(ctx, history, current, is_last_turn), False
    return _result(result, engine, fallback)


def _summarize(engine: str, ctx: InterviewContext, turns: list[TurnRecord]) -> EngineResult[FinalAssessment]:
    if engine == engines.DEEPSEEK:
        result, fallback = deepseek_engine.summarize(get_client(), ctx, turns)
    else:
        result, fallback = rule_based.summarize(ctx, turns), False
    return _result(result, engine, fallback)


async def first_question(preferred: str | None, ctx: InterviewContext) -> EngineResult[QuestionPlan]:
    return await run_in_threadpool(_first_question, engines.select(preferred), ctx)


async def evaluate(preferred: str | None, ctx: InterviewContext, history: list[TurnRecord], current: TurnRecord,
                   is_last_turn: bool) -> EngineResult[TurnEvaluation]:
    return await run_in_threadpool(_evaluate, engines.select(preferred), ctx, history, current, is_last_turn)


async def summarize(preferred: str | None, ctx: InterviewContext,
                    turns: list[TurnRecord]) -> EngineResult[FinalAssessment]:
    return await run_in_threadpool(_summarize, engines.select(preferred), ctx, turns)
