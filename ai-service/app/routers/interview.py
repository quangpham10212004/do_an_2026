"""AI Interview (FR-7.x) — phía mentor và phía admin."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.interview import service
from app.interview.views import (AnswerInput, EligibilityView, InterviewStats, InterviewView, ReviewInterviewInput,
                                 StartInterviewInput, UnlockInput)
from app import config
from app.security import AuthUser, require_internal, require_role, require_user

router = APIRouter(prefix="/api/ai")


@router.post("/interviews", response_model=InterviewView, response_model_by_alias=True)
async def start(body: StartInterviewInput | None = None,
                user: AuthUser = Depends(require_role("MENTOR"))) -> InterviewView:
    return await service.start(user, body is not None and body.self_answer_acknowledged)


@router.get("/interviews/eligibility", response_model=EligibilityView, response_model_by_alias=True)
async def my_eligibility(user: AuthUser = Depends(require_role("MENTOR"))) -> EligibilityView:
    return await service.eligibility(user.user_id)


@router.get("/interviews/me", response_model=InterviewView, response_model_by_alias=True,
            responses={204: {"description": "Mentor chưa có buổi phỏng vấn nào"}})
async def mine(user: AuthUser = Depends(require_role("MENTOR"))):
    view = await service.latest_for(user)
    return view if view is not None else Response(status_code=204)


@router.get("/interviews/{interview_id}", response_model=InterviewView, response_model_by_alias=True)
async def get(interview_id: UUID, user: AuthUser = Depends(require_user)) -> InterviewView:
    return await service.get(user, interview_id)


@router.post("/interviews/{interview_id}/answers", response_model=InterviewView, response_model_by_alias=True)
async def answer(interview_id: UUID, body: AnswerInput,
                 user: AuthUser = Depends(require_role("MENTOR"))) -> InterviewView:
    return await service.answer(user, interview_id, body.answer, body.pasted_large_text)


@router.get("/admin/interviews", response_model=list[InterviewView], response_model_by_alias=True)
async def admin_list(status: str | None = None,
                     _: AuthUser = Depends(require_role("ADMIN"))) -> list[InterviewView]:
    return await service.list_interviews(status)


@router.post("/admin/interviews/{interview_id}/review", response_model=InterviewView, response_model_by_alias=True)
async def admin_review(interview_id: UUID, body: ReviewInterviewInput,
                       user: AuthUser = Depends(require_role("ADMIN"))) -> InterviewView:
    return await service.review(user, interview_id, body)


@router.get("/admin/interviews/mentors/{mentor_id}/eligibility", response_model=EligibilityView,
            response_model_by_alias=True)
async def admin_eligibility(mentor_id: UUID, _: AuthUser = Depends(require_role("ADMIN"))) -> EligibilityView:
    return await service.eligibility(mentor_id)


@router.post("/admin/interviews/mentors/{mentor_id}/unlock", response_model=EligibilityView,
             response_model_by_alias=True)
async def admin_unlock(mentor_id: UUID, body: UnlockInput | None = None,
                       user: AuthUser = Depends(require_role("ADMIN"))) -> EligibilityView:
    return await service.unlock(user, mentor_id, body.note if body else None)


@router.get("/admin/stats", response_model=InterviewStats, response_model_by_alias=True)
async def admin_stats(_: AuthUser = Depends(require_role("ADMIN"))) -> InterviewStats:
    return await service.stats()


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
