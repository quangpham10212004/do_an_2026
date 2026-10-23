"""
Façade chấm buổi luyện phỏng vấn của mentee (FR-10.x): DeepSeek khi có API key, ngược lại (hoặc khi DeepSeek lỗi /
JSON không hợp lệ) rule-based. Báo cáo cách nói (speaking.py) luôn tính bằng hàm thuần, không qua LLM.
Engine chạy đồng bộ (httpx blocking) nên được gọi trong threadpool để không chặn event loop.
"""
from starlette.concurrency import run_in_threadpool

from app import config, engines
from app.llm.deepseek import get_client
from app.practice import deepseek_engine, rubric, rule_based, speaking
from app.practice.models import PracticeAnswer, PracticeContext, PracticeResult


def _grade(engine: str, ctx: PracticeContext, answers: list[PracticeAnswer]) -> PracticeResult:
    report = speaking.report([a.answer for a in answers])
    graded, fallback = (deepseek_engine.grade(get_client(), ctx, answers) if engine == engines.DEEPSEEK
                        else (None, False))
    if graded is None:
        turns = [rule_based.grade_turn(ctx, a) for a in answers]
        summary, strengths, improvements = rule_based.summarize(ctx, turns, report)
        used, model, version = engines.RULE_BASED, None, rule_based.PROMPT_VERSION
    else:
        turns, summary, strengths, improvements = graded
        used, model, version = engines.DEEPSEEK, config.DEEPSEEK_MODEL, deepseek_engine.PROMPT_VERSION
    return PracticeResult(overall_score=rubric.overall_score([t.score for t in turns]), summary=summary,
                          strengths=strengths, improvements=improvements, turns=turns, speaking=report,
                          engine=used, model=model, prompt_version=version,
                          fallback_used=fallback or (engine == engines.DEEPSEEK and used == engines.RULE_BASED))


async def grade(preferred: str | None, ctx: PracticeContext, answers: list[PracticeAnswer]) -> PracticeResult:
    return await run_in_threadpool(_grade, engines.select(preferred), ctx, answers)
