"""CV Parsing (FR-8.2): nhận file PDF, trả văn bản trích xuất + dữ liệu có cấu trúc."""
from fastapi import APIRouter, Depends, File, Form, UploadFile

from app import config, engines
from app.cv import deepseek_parser, rule_based
from app.cv.extractor import extract_text
from app.cv.models import ParsedCv
from app.errors import AiError
from app.llm.deepseek import get_client
from app.schemas import CamelModel
from app.security import require_internal

router = APIRouter(prefix="/internal/cv", dependencies=[Depends(require_internal)])


class CvParseResponse(CamelModel):
    raw_text: str
    parsed: ParsedCv
    engine: str
    fallback_used: bool = False


@router.post("/parse", response_model=CvParseResponse, response_model_by_alias=True)
async def parse_cv(file: UploadFile = File(...), engine: str | None = Form(default=None)) -> CvParseResponse:
    content = await file.read(config.MAX_CV_BYTES + 1)
    if len(content) > config.MAX_CV_BYTES:
        raise AiError("FILE_TOO_LARGE", "File CV không được vượt quá 5MB", status=413)
    text = extract_text(content)
    selected = engines.select(engine)
    if selected == engines.DEEPSEEK:
        parsed, fallback = deepseek_parser.parse(get_client(), text)
    else:
        parsed, fallback = rule_based.parse(text), False
    return CvParseResponse(raw_text=text, parsed=parsed, engine=selected, fallback_used=fallback)
