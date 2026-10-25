"""Xác thực mentor 2 vòng (docs/design-mentor-verification.md): phía mentor và phía admin."""
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response

from app import config
from app.interview import service as interview_service
from app.interview.views import InterviewStats, VideoView
from app.security import AuthUser, require_internal, require_role
from app.verification import service, video_service
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


async def _chunk(request: Request, user: AuthUser, interview_id: UUID, kind: str, n: int, start_ms: int, dur_ms: int) -> Response:
    declared = int(request.headers.get("content-length") or 0)
    if declared > config.VIDEO_MAX_CHUNK_BYTES:  # từ chối sớm, không đọc cả body
        raise HTTPException(status_code=413, detail={"code": "CHUNK_TOO_LARGE", "message": "Đoạn tải lên quá lớn"})
    await video_service.upload_chunk(user, interview_id, kind, n, start_ms, dur_ms, await request.body(),
                                     request.headers.get("content-type"))
    return Response(status_code=204)


@router.put("/verification/videos/{interview_id}/chunks/{n}", status_code=204)
async def upload_video_chunk(interview_id: UUID, n: int, request: Request, start_ms: int = Query(alias="startMs"),
                             dur_ms: int = Query(alias="durMs"), user: AuthUser = Depends(require_role("MENTOR"))) -> Response:
    return await _chunk(request, user, interview_id, "video", n, start_ms, dur_ms)


@router.put("/verification/videos/{interview_id}/audio-chunks/{n}", status_code=204)
async def upload_audio_chunk(interview_id: UUID, n: int, request: Request, start_ms: int = Query(alias="startMs"),
                             dur_ms: int = Query(alias="durMs"), user: AuthUser = Depends(require_role("MENTOR"))) -> Response:
    return await _chunk(request, user, interview_id, "audio", n, start_ms, dur_ms)


@router.post("/verification/videos/{interview_id}/finish", response_model=VideoView, response_model_by_alias=True)
async def finish_video(interview_id: UUID, user: AuthUser = Depends(require_role("MENTOR"))) -> VideoView:
    return await video_service.finish(user, interview_id)


@router.post("/verification/videos/{interview_id}/play-token")
async def video_play_token(interview_id: UUID, user: AuthUser = Depends(require_role("MENTOR", "ADMIN"))) -> dict:
    token = await video_service.play_token(user, interview_id)
    return {"url": token["url"], "expiresAt": token["expires_at"]}


@router.get("/verification/videos/{interview_id}/stream")
async def stream_video(interview_id: UUID, token: str, range: str | None = Header(default=None)) -> Response:
    return await video_service.stream(interview_id, token, range)


@router.delete("/admin/verification/videos/{interview_id}", response_model=VideoView, response_model_by_alias=True)
async def admin_delete_video(interview_id: UUID, user: AuthUser = Depends(require_role("ADMIN"))) -> VideoView:
    return await video_service.delete_video(user, interview_id)


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
