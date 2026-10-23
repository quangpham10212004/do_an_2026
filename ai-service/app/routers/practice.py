"""FR-10.x — "Luyện phỏng vấn với AI" (mentee, giọng nói). Admin chỉ xem được từng buổi."""
from uuid import UUID

from fastapi import APIRouter, Depends

from app.interview.voice import TranscriptInput
from app.practice import service
from app.practice.views import PracticeEligibilityView, PracticeStart, PracticeView, StartPracticeInput
from app.security import AuthUser, require_role, require_user

router = APIRouter(prefix="/api/ai/practice-interviews")


@router.get("/eligibility", response_model=PracticeEligibilityView, response_model_by_alias=True)
async def eligibility(user: AuthUser = Depends(require_role("MENTEE"))) -> PracticeEligibilityView:
    return await service.eligibility(user)


@router.post("", response_model=PracticeStart, response_model_by_alias=True)
async def start(body: StartPracticeInput, user: AuthUser = Depends(require_role("MENTEE"))) -> PracticeStart:
    return await service.start(user, body)


@router.get("/me", response_model=list[PracticeView], response_model_by_alias=True)
async def mine(user: AuthUser = Depends(require_role("MENTEE"))) -> list[PracticeView]:
    return await service.mine(user)


@router.get("/{practice_id}", response_model=PracticeView, response_model_by_alias=True)
async def get(practice_id: UUID, user: AuthUser = Depends(require_user)) -> PracticeView:
    return await service.get(user, practice_id)


@router.post("/{practice_id}/complete", response_model=PracticeView, response_model_by_alias=True)
async def complete(practice_id: UUID, body: TranscriptInput,
                   user: AuthUser = Depends(require_role("MENTEE"))) -> PracticeView:
    return await service.complete(user, practice_id, body.items)
