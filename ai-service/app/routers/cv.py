"""CV Parsing (FR-8.1, FR-8.2) — upload, parse và tải lại file CV."""
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import StreamingResponse

from app import config
from app.enrichment import service
from app.enrichment.views import CvSummaryView, CvUploadResult, CvView
from app.security import AuthUser, require_role, require_user

router = APIRouter(prefix="/api/ai")


async def _read(file: UploadFile) -> tuple[str, bytes]:
    return file.filename or "cv.pdf", await file.read(config.MAX_CV_BYTES + 1)


@router.post("/mentee/{mentee_id}/cv-upload", response_model=CvUploadResult, response_model_by_alias=True)
async def upload(mentee_id: UUID, file: UploadFile = File(...),
                 user: AuthUser = Depends(require_role("MENTEE", "ADMIN"))) -> CvUploadResult:
    file_name, content = await _read(file)
    return await service.upload_for_mentee(user, mentee_id, file_name, content)


@router.post("/cv/parse", response_model=CvView, response_model_by_alias=True)
async def parse(file: UploadFile = File(...), user: AuthUser = Depends(require_user)) -> CvView:
    """Parse CV không kèm chatbot — mentor dùng để điền nhanh hồ sơ."""
    file_name, content = await _read(file)
    return await service.parse_and_store(user.user_id, file_name, content)


@router.get("/cv/{cv_id}/file")
async def download(cv_id: UUID, user: AuthUser = Depends(require_user)) -> Response:
    file_name, content = await service.cv_file(user, cv_id)
    return StreamingResponse(
        iter([content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(file_name)}"},
    )


@router.get("/cv/mine", response_model=list[CvSummaryView], response_model_by_alias=True)
async def mine(user: AuthUser = Depends(require_user)) -> list[CvSummaryView]:
    """CV của chính người gọi — để giao diện cho phép xem/xoá."""
    return await service.my_cvs(user)


@router.delete("/cv/{cv_id}", status_code=204)
async def delete(cv_id: UUID, user: AuthUser = Depends(require_user)) -> Response:
    """Xoá CV (chủ CV hoặc ADMIN) — chính sách dữ liệu CV."""
    await service.delete_cv(user, cv_id)
    return Response(status_code=204)
