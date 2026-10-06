import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.matching import IndexStatusResponse, RebuildResponse, ReindexRequest
from app.security import Caller, require_admin, require_internal, require_user
from app.services import index_service

router = APIRouter()


def _parse_uuid(value: str) -> str:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "userId không hợp lệ"})
    return value


def _response(result: index_service.IndexResult) -> IndexStatusResponse:
    if result.status == index_service.NOT_FOUND:
        raise HTTPException(
            status_code=404,
            detail={"code": "PROFILE_NOT_FOUND", "message": "Không tìm thấy hồ sơ để lập chỉ mục"},
        )
    return IndexStatusResponse(
        user_id=result.user_id, role=result.role, status=result.status, indexed_at=result.indexed_at
    )


@router.post("/internal/embeddings/reindex", response_model=IndexStatusResponse,
             dependencies=[Depends(require_internal)])
async def reindex(req: ReindexRequest) -> IndexStatusResponse:
    """
    Nội bộ — profile-service gọi sau khi lưu hồ sơ để chỉ mục được cập nhật ngay.
    Lời gọi là best-effort: profile-service KHÔNG chờ kết quả và không retry; nếu
    thông báo bị mất thì IndexSyncJob sẽ bắt được ở vòng quét kế tiếp.
    Yêu cầu header X-Internal-Token.
    """
    result = await index_service.reindex(_parse_uuid(req.user_id), role=req.role, force=req.force)
    return _response(result)


@router.get("/api/matching/index-status", response_model=IndexStatusResponse)
async def index_status(userId: str = Query(...), caller: Caller = Depends(require_user)) -> IndexStatusResponse:
    """Trạng thái chỉ mục embedding của 1 hồ sơ (chính chủ, hoặc ADMIN/nội bộ)."""
    _parse_uuid(userId)
    if not caller.is_privileged and caller.user_id != userId:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Bạn chỉ được xem trạng thái hồ sơ của chính mình"},
        )
    return _response(await index_service.status(userId))


@router.post("/api/matching/admin/embeddings/rebuild", response_model=RebuildResponse,
             dependencies=[Depends(require_admin)])
async def rebuild(force: bool = Query(False)) -> RebuildResponse:
    """
    (ADMIN) Sinh embedding còn thiếu (force=false) hoặc sinh lại toàn bộ (force=true).
    Dùng khi đổi model hoặc đổi format text chuẩn hoá.
    """
    return RebuildResponse(**await index_service.rebuild_all(force))
