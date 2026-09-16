from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.schemas.matching import EmbedRequest, EmbedResponse
from app.security import require_internal
from app.services.embedding_service import embed_text

router = APIRouter()


@router.post("/internal/embed", response_model=EmbedResponse, dependencies=[Depends(require_internal)])
async def embed(req: EmbedRequest) -> EmbedResponse:
    """
    Nội bộ — được profile-service gọi mỗi khi profile được tạo/cập nhật.
    Yêu cầu header X-Internal-Token. Model chạy trong threadpool để không chặn event loop.
    """
    vector = await run_in_threadpool(embed_text, req.text)
    return EmbedResponse(embedding=vector)
