"""Xác thực mentor bằng phỏng vấn AI trực tiếp (frontend: features/verification, contracts/ai-service.yaml)."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.security import AuthUser, require_internal, require_role
from app.verification import live_admin as admin
from app.verification import live_service as service

router = APIRouter()
Mentor = Depends(require_role("MENTOR"))
Admin = Depends(require_role("ADMIN"))
Domain = Literal["backend", "frontend", "fullstack", "devops", "data", "mobile"]
M = "/api/ai/verification"
A = "/api/ai/admin/verification"


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TrackInput(Input):
    domain: Domain


class StartInput(Input):
    trackId: UUID
    consent: bool


class HeartbeatInput(Input):
    remainingSeconds: float = Field(ge=0)


class DecisionInput(Input):
    decision: Literal["APPROVE", "REJECT"]
    note: str = Field(default="", max_length=4000)
    reviewedVideo: bool = False


@router.get(M + "/status")
async def overview(user: AuthUser = Mentor):
    return await service.overview(user)


@router.post(M + "/tracks", status_code=201)
async def add_track(body: TrackInput, user: AuthUser = Mentor):
    return await service.add_track(user, body.domain)


@router.post(M + "/interviews")
async def start(body: StartInput, user: AuthUser = Mentor):
    return await service.start(user, body.trackId, body.consent)


@router.get(M + "/interviews/{interview_id}")
async def interview(interview_id: UUID, user: AuthUser = Mentor):
    return await service.get_interview(user, interview_id)


@router.post(M + "/interviews/{interview_id}/answers")
async def answer(interview_id: UUID, questionId: str = Form(max_length=64), transcript: str = Form(default=""),
                 durationSeconds: float = Form(default=0, ge=0), media: UploadFile | None = File(default=None),
                 user: AuthUser = Mentor):
    return await service.answer(user, interview_id, questionId, transcript, round(durationSeconds), media)


@router.post(M + "/interviews/{interview_id}/heartbeat", status_code=204)
async def heartbeat(interview_id: UUID, body: HeartbeatInput, user: AuthUser = Mentor):
    await service.heartbeat(user, interview_id, body.remainingSeconds)


@router.post(M + "/interviews/{interview_id}/submit")
async def submit(interview_id: UUID, user: AuthUser = Mentor):
    return await service.submit(user, interview_id)


@router.get(M + "/results/{result_id}")
async def result(result_id: UUID, user: AuthUser = Mentor):
    return await service.get_result(user, result_id)


@router.get(M + "/history")
async def history(user: AuthUser = Mentor):
    return await service.history(user)


@router.get(M + "/answer-videos/{answer_id}/stream")
async def stream(answer_id: UUID, token: str, range: str | None = Header(default=None)):
    return await admin.stream(answer_id, token, range)


@router.get(A + "/queue")
async def queue(filter: Literal["UNCLEAR", "DECIDED"] = "UNCLEAR", q: str = Query(default="", max_length=200),
                user: AuthUser = Admin):
    return await admin.queue(filter, q)


@router.get(A + "/{result_id}")
async def detail(result_id: UUID, user: AuthUser = Admin):
    return await admin.detail(user, result_id)


@router.post(A + "/{result_id}/decision", status_code=204)
async def decide(result_id: UUID, body: DecisionInput, user: AuthUser = Admin):
    await admin.decide(user, result_id, body.decision, body.note, body.reviewedVideo)


@router.delete("/internal/verification/mentors/{mentor_id}/tracks/{domain}", status_code=204,
               dependencies=[Depends(require_internal)])
async def cancel(mentor_id: UUID, domain: Domain, profileDomainId: UUID | None = None):
    await service.cancel(mentor_id, domain, profileDomainId)



