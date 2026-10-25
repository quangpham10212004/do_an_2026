"""AI Interview (FR-7.x) — phía mentor và phía admin."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.interview import service, voice
from app.interview.views import InterviewView, VoiceInterviewStart
from app import config
from app.security import AuthUser, require_internal, require_role, require_user

router = APIRouter(prefix="/api/ai")


@router.get("/interviews/me", response_model=InterviewView, response_model_by_alias=True,
            responses={204: {"description": "Mentor chưa có buổi phỏng vấn nào"}})
async def mine(user: AuthUser = Depends(require_role("MENTOR"))):
    view = await service.latest_for(user)
    return view if view is not None else Response(status_code=204)


@router.get("/interviews/{interview_id}", response_model=InterviewView, response_model_by_alias=True)
async def get(interview_id: UUID, user: AuthUser = Depends(require_user)) -> InterviewView:
    return await service.get(user, interview_id)


# FR-7.7 — phỏng vấn giọng nói (OpenAI Realtime).
@router.post("/interviews/voice", response_model=VoiceInterviewStart, response_model_by_alias=True)
async def start_voice(body: voice.VoiceConsentInput | None = None,
                      user: AuthUser = Depends(require_role("MENTOR"))) -> VoiceInterviewStart:
    body = body or voice.VoiceConsentInput()
    return await service.start_voice(user, body.self_answer_acknowledged, body.consent_external_ai)


@router.post("/interviews/{interview_id}/voice-transcript", response_model=InterviewView, response_model_by_alias=True)
async def voice_transcript(interview_id: UUID, body: voice.TranscriptInput,
                           user: AuthUser = Depends(require_role("MENTOR"))) -> InterviewView:
    return await service.submit_voice_transcript(user, interview_id, body.items)


# Router không có tiền tố /api/ai: /internal/** không bao giờ đi qua proxy của frontend.
dev_router = APIRouter()


@dev_router.post("/internal/dev/interviews/{interview_id}/age", include_in_schema=False, response_model=InterviewView,
             response_model_by_alias=True)
async def dev_age(interview_id: UUID, hours: float = 73, _: AuthUser = Depends(require_internal)) -> InterviewView:
    """Chỉ dev/e2e — không tồn tại ở APP_ENV=prod. US-43: lùi buổi phỏng vấn `hours` giờ để kiểm thử hạn 72 giờ."""
    if config.is_prod():
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Not found"})
    return await service.dev_age(interview_id, hours)


@dev_router.post("/internal/dev/cvs/{cv_id}/age", include_in_schema=False)
async def dev_age_cv(cv_id: UUID, days: float = 366, _: AuthUser = Depends(require_internal)) -> dict:
    """Chỉ dev/e2e — US-45: lùi ngày tải CV `days` ngày rồi chạy ngay job lưu giữ 12 tháng."""
    if config.is_prod():
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Not found"})
    from app.db import get_pool
    from app.enrichment import service as enrichment_service
    pool = await get_pool()
    await pool.execute("UPDATE cv_documents SET created_at = created_at - make_interval(secs => $2) WHERE id = $1",
                       cv_id, days * 86400)
    return {"purged": await enrichment_service.purge_expired_cvs()}
