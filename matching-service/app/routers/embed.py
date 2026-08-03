from fastapi import APIRouter
from app.schemas.matching import EmbedRequest, EmbedResponse
from app.services.embedding_service import embed_text

router = APIRouter()


@router.post("/internal/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """
    Nội bộ — được profile-service gọi mỗi khi profile được tạo/cập nhật.
    KHÔNG expose ra ngoài (nên chặn ở API gateway/network policy khi deploy
    thật — trong đồ án, docker-compose network nội bộ là đủ).
    """
    vector = embed_text(req.text)
    return EmbedResponse(embedding=vector)
