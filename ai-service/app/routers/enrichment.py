"""Chatbot enrichment (FR-8.3 → FR-8.5) — hội thoại làm rõ mục tiêu của mentee."""
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.enrichment import service
from app.enrichment.views import AnswerInput, ConversationView, CvUploadResult
from app.security import AuthUser, require_role, require_user

router = APIRouter(prefix="/api/ai")


@router.get("/mentee/{mentee_id}/enrichment/latest", response_model=CvUploadResult, response_model_by_alias=True,
            responses={204: {"description": "Mentee chưa tải CV lần nào"}})
async def latest(mentee_id: UUID, user: AuthUser = Depends(require_user)):
    result = await service.latest(user, mentee_id)
    return result if result is not None else Response(status_code=204)


@router.get("/enrichment/conversations/{conversation_id}", response_model=ConversationView,
            response_model_by_alias=True)
async def conversation(conversation_id: UUID, user: AuthUser = Depends(require_user)) -> ConversationView:
    return await service.get(user, conversation_id)


@router.post("/enrichment/conversations/{conversation_id}/answers", response_model=ConversationView,
             response_model_by_alias=True)
async def answer(conversation_id: UUID, body: AnswerInput,
                 user: AuthUser = Depends(require_role("MENTEE"))) -> ConversationView:
    return await service.answer(user, conversation_id, body.answer)
