"""Façade chọn engine parse CV: DeepSeek khi có API key, fallback rule-based."""
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from app import engines
from app.cv import deepseek_parser, rule_based
from app.cv.extractor import extract_text
from app.cv.models import ParsedCv
from app.llm.deepseek import get_client


@dataclass(frozen=True)
class CvParseResult:
    raw_text: str
    parsed: ParsedCv
    engine: str
    fallback_used: bool


def _parse(engine: str, pdf_bytes: bytes) -> CvParseResult:
    text = extract_text(pdf_bytes)
    if engine == engines.DEEPSEEK:
        parsed, fallback = deepseek_parser.parse(get_client(), text)
    else:
        parsed, fallback = rule_based.parse(text), False
    return CvParseResult(raw_text=text, parsed=parsed, engine=engine, fallback_used=fallback)


async def parse(preferred: str | None, pdf_bytes: bytes) -> CvParseResult:
    return await run_in_threadpool(_parse, engines.select(preferred), pdf_bytes)
