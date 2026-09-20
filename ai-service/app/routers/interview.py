"""AI Interview (FR-7.x) — phía mentor và phía admin."""
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.interview import service
from app.interview.views import AnswerInput, InterviewStats, InterviewView, ReviewInterviewInput
from app.security import AuthUser, require_role, require_user

router = APIRouter(prefix="/api/ai")


@router.post("/interviews", response_model=InterviewView, response_model_by_alias=True)
async def start(user: AuthUser = Depends(require_role("MENTOR"))) -> InterviewView:
    return await service.start(user)


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
    return await service.answer(user, interview_id, body.answer)


@router.get("/admin/interviews", response_model=list[InterviewView], response_model_by_alias=True)
async def admin_list(status: str | None = None,
                     _: AuthUser = Depends(require_role("ADMIN"))) -> list[InterviewView]:
    return await service.list_interviews(status)


@router.post("/admin/interviews/{interview_id}/review", response_model=InterviewView, response_model_by_alias=True)
async def admin_review(interview_id: UUID, body: ReviewInterviewInput,
                       user: AuthUser = Depends(require_role("ADMIN"))) -> InterviewView:
    return await service.review(user, interview_id, body)


@router.get("/admin/stats", response_model=InterviewStats, response_model_by_alias=True)
async def admin_stats(_: AuthUser = Depends(require_role("ADMIN"))) -> InterviewStats:
    return await service.stats()
