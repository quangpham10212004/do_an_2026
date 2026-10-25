"""Xác thực mentor 2 vòng (docs/design-mentor-verification.md): phía mentor và phía admin."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import config
from app.interview import service as interview_service
from app.interview.views import InterviewStats
from app.security import AuthUser, require_internal, require_role
from app.verification import service
from app.verification.views import ApplicationView, Round1ReviewInput, VerificationStatusView

router = APIRouter(prefix="/api/ai")


@router.get("/verification/status", response_model=VerificationStatusView, response_model_by_alias=True)
async def my_status(user: AuthUser = Depends(require_role("MENTOR"))) -> VerificationStatusView:
    await interview_service.abandon_stale(user.user_id)  # kiểm tra lười: buổi quá hạn được đánh dấu trước khi báo trạng thái
    return await service.status_view(user.user_id)


@router.post("/verification/applications", response_model=VerificationStatusView, response_model_by_alias=True)
async def start_application(user: AuthUser = Depends(require_role("MENTOR"))) -> VerificationStatusView:
    await interview_service.abandon_stale(user.user_id)
    return await service.start_application(user)


@router.get("/admin/verification/applications", response_model=list[ApplicationView], response_model_by_alias=True)
async def admin_list(status: str | None = None, _: AuthUser = Depends(require_role("ADMIN"))) -> list[ApplicationView]:
    return await service.list_applications(status)


@router.get("/admin/verification/applications/{application_id}", response_model=ApplicationView,
            response_model_by_alias=True)
async def admin_detail(application_id: UUID, _: AuthUser = Depends(require_role("ADMIN"))) -> ApplicationView:
    return await service.get_application(application_id)


@router.post("/admin/verification/applications/{application_id}/round1-review", response_model=ApplicationView,
             response_model_by_alias=True)
async def admin_round1_review(application_id: UUID, body: Round1ReviewInput,
                              user: AuthUser = Depends(require_role("ADMIN"))) -> ApplicationView:
    return await service.round1_review(user, application_id, body)


@router.get("/admin/stats", response_model=InterviewStats, response_model_by_alias=True)
async def admin_stats(_: AuthUser = Depends(require_role("ADMIN"))) -> InterviewStats:
    return await service.stats()


# Router không có tiền tố /api/ai: /internal/** không bao giờ đi qua proxy của frontend.
dev_router = APIRouter()


@dev_router.post("/internal/dev/verification/{application_id}/age", include_in_schema=False,
                 response_model=ApplicationView, response_model_by_alias=True)
async def dev_age(application_id: UUID, days: float = 16, _: AuthUser = Depends(require_internal)) -> ApplicationView:
    """Chỉ dev/e2e — không tồn tại ở APP_ENV=prod: lùi mốc của đợt `days` ngày để kiểm thử thời gian chờ 15 ngày."""
    if config.is_prod():
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Not found"})
    return await service.dev_age(application_id, days)
