"""CV Parsing (FR-8.1, FR-8.2) — upload, parse và tải lại file CV."""
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from fastapi.responses import StreamingResponse

from app import config, errors
from app.cv.models import ConfirmedFields
from app.enrichment import service
from app.enrichment.views import CvSummaryView, CvUploadResult, CvView
from app.ratelimit import RateLimiter
from app.security import AuthUser, require_role, require_user

router = APIRouter(prefix="/api/ai")

# US-46 (NFR-10) — tối đa 5 CV / giờ / người dùng (upload cho chatbot + parse của mentor), đếm sau khi form hợp lệ.
upload_limiter = RateLimiter(config.CV_UPLOADS_PER_HOUR, 3600)


def _limit_uploads(user: AuthUser) -> None:
    if user.user_id is None:  # service nội bộ
        return
    wait = upload_limiter.hit(str(user.user_id))
    if wait:
        raise errors.AiError("RATE_LIMITED", f"Bạn đã tải lên {config.CV_UPLOADS_PER_HOUR} CV trong 1 giờ qua. "
                             f"Vui lòng thử lại sau {wait // 60 + 1} phút.", status=429,
                             headers={"Retry-After": str(wait)})


async def _read(file: UploadFile) -> tuple[str, bytes]:
    return file.filename or "cv.pdf", await file.read(config.MAX_CV_BYTES + 1)


def _consent(value: bool | None) -> bool:
    """US-19 — trường bắt buộc: người dùng phải chủ động chọn đồng ý / không đồng ý gửi CV tới AI bên ngoài."""
    if value is None:
        raise errors.bad_request("CONSENT_REQUIRED",
                                 "Vui lòng cho biết bạn có đồng ý gửi CV tới AI bên ngoài (DeepSeek) hay không")
    return value


# Trường form multipart; false => chỉ dùng engine rule-based cho CV này (parse + chatbot).
ConsentField = Form(None, alias="consentExternalAi")


@router.post("/mentee/{mentee_id}/cv-upload", response_model=CvUploadResult, response_model_by_alias=True)
async def upload(mentee_id: UUID, file: UploadFile = File(...), consent_external_ai: bool | None = ConsentField,
                 user: AuthUser = Depends(require_role("MENTEE", "ADMIN"))) -> CvUploadResult:
    consent = _consent(consent_external_ai)
    file_name, content = await _read(file)
    _limit_uploads(user)
    return await service.upload_for_mentee(user, mentee_id, file_name, content, consent)


@router.post("/cv/parse", response_model=CvView, response_model_by_alias=True)
async def parse(file: UploadFile = File(...), consent_external_ai: bool | None = ConsentField,
                user: AuthUser = Depends(require_user)) -> CvView:
    """Parse CV không kèm chatbot — mentor dùng để điền nhanh hồ sơ (không ghi gì vào hồ sơ)."""
    consent = _consent(consent_external_ai)
    file_name, content = await _read(file)
    _limit_uploads(user)
    return await service.parse_and_store(user.user_id, file_name, content, consent)


@router.put("/cv/{cv_id}/confirmed-fields", response_model=CvView, response_model_by_alias=True)
async def confirm_fields(cv_id: UUID, body: ConfirmedFields, user: AuthUser = Depends(require_user)) -> CvView:
    """US-20 — lưu thông tin CV người dùng đã xem lại/sửa/bỏ (chỉ chủ CV); không ghi gì vào hồ sơ."""
    return await service.confirm_fields(user, cv_id, body)


@router.post("/cv/{cv_id}/enrichment-conversation", response_model=CvUploadResult, response_model_by_alias=True)
async def start_conversation(cv_id: UUID, user: AuthUser = Depends(require_role("MENTEE"))) -> CvUploadResult:
    """US-20 — bắt đầu chatbot enrichment cho CV đã duyệt (gọi lại trả về hội thoại đã có)."""
    return await service.start_conversation(user, cv_id)


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
async def delete(cv_id: UUID, removeSkills: bool = False, user: AuthUser = Depends(require_user)) -> Response:
    """Xoá CV (chủ CV hoặc ADMIN) — chính sách dữ liệu CV. removeSkills=true (US-45): gỡ cả kỹ năng đã thêm từ CV này."""
    await service.delete_cv(user, cv_id, removeSkills)
    return Response(status_code=204)
