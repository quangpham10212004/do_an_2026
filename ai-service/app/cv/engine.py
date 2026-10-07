"""
Façade chọn engine parse CV: DeepSeek khi có API key VÀ người dùng đồng ý gửi CV ra ngoài (US-19),
ngược lại rule-based; DeepSeek lỗi => fallback rule-based.
"""
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


def engine_for(preferred: str | None, allow_external: bool) -> str:
    """
    US-19 — không có đồng ý gửi AI bên ngoài => luôn RULE_BASED, KHÔNG hỏi tới client DeepSeek. Dùng chung cho
    parse CV và mọi lượt chatbot enrichment của CV đó.
    """
    return engines.select(preferred) if allow_external else engines.RULE_BASED


def _parse(engine: str, pdf_bytes: bytes) -> CvParseResult:
    text = extract_text(pdf_bytes)
    if engine == engines.DEEPSEEK:
        parsed, fallback = deepseek_parser.parse(get_client(), text)
    else:
        parsed, fallback = rule_based.parse(text), False
    return CvParseResult(raw_text=text, parsed=parsed, engine=engine, fallback_used=fallback)


async def parse(preferred: str | None, pdf_bytes: bytes, allow_external: bool) -> CvParseResult:
    return await run_in_threadpool(_parse, engine_for(preferred, allow_external), pdf_bytes)
